import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type {
  Account,
  BudgetLine,
  Category,
  Objective,
  RecurringTransaction,
  Transaction,
  TransactionHistoryEntry,
} from "@/lib/types";

type SplitRow = {
  transaction_id: string;
  category_id: string | null;
  amount: number;
};

// Creates one transaction per active recurring entry for the given period,
// dated on its day_of_month within that period's month. Skips entries that
// already have a transaction generated for this period (tracked via
// recurring_transaction_id) so re-running never double-creates. Plain query
// (no revalidatePath) so it's safe to call from a Server Component's own
// render, not just from a Server Action.
export async function generateRecurringForPeriod(periodId: string) {
  const supabase = await createClient();

  // getSession() reads the JWT straight from cookies with no network call,
  // unlike getUser() which re-validates against the auth server — safe here
  // (unlike a Server Action) because this only runs mid-render on a request
  // the proxy middleware has already put through that same revalidation, and
  // the result only feeds attribution columns on an insert already scoped by
  // RLS, not a security decision.
  const [{ data: period }, { data: recurring }, { data: existing }, { data: { session } }] =
    await Promise.all([
      supabase.from("periods").select("*").eq("id", periodId).single(),
      supabase.from("recurring_transactions").select("*").eq("is_active", true),
      supabase
        .from("transactions")
        .select("recurring_transaction_id")
        .eq("period_id", periodId)
        .not("recurring_transaction_id", "is", null),
      supabase.auth.getSession(),
    ]);

  if (!period || !recurring || recurring.length === 0) return;

  const alreadyGenerated = new Set((existing ?? []).map((t) => t.recurring_transaction_id));
  const periodStart = new Date(period.start_date + "T00:00:00");
  const year = periodStart.getFullYear();
  const month = periodStart.getMonth();

  const rows = recurring
    .filter((r) => !alreadyGenerated.has(r.id))
    .map((r) => {
      const day = String(r.day_of_month).padStart(2, "0");
      const monthStr = String(month + 1).padStart(2, "0");
      return {
        kind: r.kind,
        description: r.description,
        amount: r.amount,
        txn_date: `${year}-${monthStr}-${day}`,
        account_id: r.account_id,
        category_id: r.category_id,
        period_id: periodId,
        recurring_transaction_id: r.id,
        created_by: session?.user.id ?? null,
        created_by_email: session?.user.email ?? null,
      };
    });

  if (rows.length > 0) {
    await supabase.from("transactions").insert(rows);
  }
}

// Splits belong to transactions whose own category_id is null (the parent
// just holds the total). Folds split amounts into the same category-id ->
// amount accumulation used for non-split transactions.
async function applySplits(
  transactionIds: string[],
  actualByCategory: Map<string, number>,
) {
  if (transactionIds.length === 0) return;
  const supabase = await createClient();
  const { data: splits } = await supabase
    .from("transaction_splits")
    .select("transaction_id, category_id, amount")
    .in("transaction_id", transactionIds);

  for (const s of (splits ?? []) as SplitRow[]) {
    if (!s.category_id) continue;
    actualByCategory.set(
      s.category_id,
      (actualByCategory.get(s.category_id) ?? 0) + s.amount,
    );
  }
}

export type AccountWithBalance = Account & { balance: number };

// Supabase/PostgREST silently caps an unpaginated select at 1000 rows — past
// that, later pages just vanish from the result with no error. Once total
// transaction count crosses 1000 this under-counted every account's balance.
// Page through in fixed-size chunks so a growing history can never do that
// again.
const PAGE_SIZE = 1000;

// `cache()` memoizes per request (Server Component render / route handler),
// not across requests — several derived series (getAccountsWithBalances,
// getBalanceHistory, getNetWorthHistory, getDebtBalanceHistory) each need
// the full accounts table and/or the full transactions table, and a single
// page load routinely calls more than one of them together (the Overview
// page always awaits getNetWorthHistory and getBalanceHistory in the same
// Promise.all). Without this they'd each independently re-fetch — and for
// transactions, re-paginate through — the exact same rows every time.
const getAllAccountsRaw = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .order("sort_order")
    .order("created_at");
  if (error) throw error;
  return data ?? [];
});

// Same sharing as getAllAccountsRaw — getCategories, getPlannedTotalsByPeriod,
// and getTopCategoryByMonth all need "every category" and previously each
// ran their own `.from("categories").select(...)`, which meant a single
// Reports page load fired 3 separate full-table category fetches.
const getAllCategoriesRaw = cache(async (): Promise<Category[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("categories").select("*");
  if (error) throw error;
  return data ?? [];
});

const fetchAllTransactionRows = cache(async (): Promise<
  {
    account_id: string | null;
    to_account_id: string | null;
    kind: string;
    amount: number;
    txn_date: string;
  }[]
> => {
  const supabase = await createClient();
  const rows: {
    account_id: string | null;
    to_account_id: string | null;
    kind: string;
    amount: number;
    txn_date: string;
  }[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("transactions")
      .select("account_id, to_account_id, kind, amount, txn_date")
      .is("deleted_at", null)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
});

export async function getAccountsWithBalances(): Promise<AccountWithBalance[]> {
  const [accounts, transactions] = await Promise.all([
    getAllAccountsRaw(),
    fetchAllTransactionRows(),
  ]);

  // A debt account's `balance` means "amount currently owed," not cash on
  // hand — the opposite sign convention from every other account. A charge/
  // payment logged directly on the account already accounts for that (kind
  // is flipped at entry time). A *transfer* doesn't know it's touching a
  // debt account, though: paying a card off is "money moves from checking
  // to the card," and generically that would credit the card's balance
  // (treating it like any other destination account gaining money) — which
  // is backwards, since paying it down should reduce what's owed, not
  // increase it. Flip the sign for whichever leg of the transfer lands on
  // a debt account.
  const isDebtAccount = new Map((accounts ?? []).map((a) => [a.id, a.is_debt]));

  const deltaByAccount = new Map<string, number>();
  for (const t of transactions ?? []) {
    if (t.kind === "transfer") {
      if (t.account_id) {
        const sign = isDebtAccount.get(t.account_id) ? 1 : -1;
        deltaByAccount.set(
          t.account_id,
          (deltaByAccount.get(t.account_id) ?? 0) + sign * t.amount,
        );
      }
      if (t.to_account_id) {
        const sign = isDebtAccount.get(t.to_account_id) ? -1 : 1;
        deltaByAccount.set(
          t.to_account_id,
          (deltaByAccount.get(t.to_account_id) ?? 0) + sign * t.amount,
        );
      }
      continue;
    }
    if (!t.account_id) continue;
    const delta = t.kind === "income" ? t.amount : -t.amount;
    deltaByAccount.set(
      t.account_id,
      (deltaByAccount.get(t.account_id) ?? 0) + delta,
    );
  }

  return (accounts ?? []).map((a) => ({
    ...a,
    balance: a.starting_balance + (deltaByAccount.get(a.id) ?? 0),
  }));
}

export type PeriodSummary = {
  income: number;
  expense: number;
  net: number;
  savingsRate: number | null;
};

// A debt account stores a charge as kind='income' (owe more) and a payment
// as kind='expense' (owe less) — inverted from every other account, needed
// so account-balance math (getAccountsWithBalances) works. Every place that
// aggregates "real" household income/expense has to undo that inversion, or
// a credit-card charge reads as income, and paying the card off double-
// counts as a second expense on top of the one already counted when it was
// charged. Reclassifies a transaction's kind for aggregation purposes; null
// means "don't count this at all" (a transfer, or a debt-account payment —
// the latter is money moving to pay down spending already counted, the
// same treatment a transfer between two of your own accounts gets).
const getDebtAccountIds = cache(async (): Promise<Set<string>> => {
  const accounts = await getAllAccountsRaw();
  return new Set(accounts.filter((a) => a.is_debt).map((a) => a.id));
});

function reclassifyKind(
  kind: string,
  account_id: string | null,
  debtAccountIds: Set<string>,
): "income" | "expense" | null {
  if (kind !== "income" && kind !== "expense") return null;
  const isDebt = account_id ? debtAccountIds.has(account_id) : false;
  if (!isDebt) return kind as "income" | "expense";
  return kind === "income" ? "expense" : null;
}

export async function getPeriodSummary(
  periodId: string,
): Promise<PeriodSummary> {
  const supabase = await createClient();
  const [{ data }, debtAccountIds] = await Promise.all([
    supabase
      .from("transactions")
      .select("kind, amount, account_id")
      .eq("period_id", periodId)
      .is("deleted_at", null),
    getDebtAccountIds(),
  ]);

  let income = 0;
  let expense = 0;
  for (const t of data ?? []) {
    const kind = reclassifyKind(t.kind, t.account_id, debtAccountIds);
    if (kind === "income") income += t.amount;
    else if (kind === "expense") expense += t.amount;
  }

  const net = income - expense;
  return {
    income,
    expense,
    net,
    savingsRate: income > 0 ? net / income : null,
  };
}

export type CategoryProgress = Category & {
  planned: number;
  actual: number;
  remaining: number;
  overBudget: boolean;
  transactions: {
    id: string;
    description: string;
    amount: number;
    txn_date: string;
  }[];
};

export async function getCategoryProgress(
  periodId: string,
): Promise<CategoryProgress[]> {
  const supabase = await createClient();

  const [
    { data: period },
    { data: categories },
    { data: budgetLines },
    { data: transactions },
    debtAccountIds,
  ] = await Promise.all([
    supabase.from("periods").select("*").eq("id", periodId).single(),
    supabase.from("categories").select("*").eq("kind", "expense").order("name"),
    supabase.from("budget_lines").select("*").eq("period_id", periodId),
    supabase
      .from("transactions")
      .select("id, category_id, amount, description, txn_date, account_id, kind")
      .eq("period_id", periodId)
      .in("kind", ["income", "expense"])
      .is("deleted_at", null)
      .order("txn_date", { ascending: false }),
    getDebtAccountIds(),
  ]);

  const plannedByCategory = new Map<string, number>();
  for (const line of (budgetLines ?? []) as BudgetLine[]) {
    plannedByCategory.set(line.category_id, line.planned_amount);
  }

  const actualByCategory = new Map<string, number>();
  const transactionsByCategory = new Map<
    string,
    { id: string; description: string; amount: number; txn_date: string }[]
  >();
  const splitTransactionIds: string[] = [];
  for (const t of (transactions ?? []) as Pick<
    Transaction,
    "id" | "category_id" | "amount" | "description" | "txn_date" | "account_id" | "kind"
  >[]) {
    // A debt-account payment isn't new spending (it's paying down a charge
    // already counted here when it happened), so it's excluded rather than
    // added as a second expense.
    if (reclassifyKind(t.kind, t.account_id, debtAccountIds) !== "expense") continue;
    if (!t.category_id) {
      splitTransactionIds.push(t.id);
      continue;
    }
    actualByCategory.set(
      t.category_id,
      (actualByCategory.get(t.category_id) ?? 0) + t.amount,
    );
    const list = transactionsByCategory.get(t.category_id) ?? [];
    list.push({
      id: t.id,
      description: t.description,
      amount: t.amount,
      txn_date: t.txn_date,
    });
    transactionsByCategory.set(t.category_id, list);
  }
  await applySplits(splitTransactionIds, actualByCategory);

  const rolloverCategories = ((categories ?? []) as Category[]).filter(
    (c) => c.rollover,
  );
  const rolloverByCategory = await getRolloverAmounts(
    period,
    rolloverCategories,
  );

  return ((categories ?? []) as Category[]).map((c) => {
    const planned =
      (plannedByCategory.get(c.id) ?? 0) + (rolloverByCategory.get(c.id) ?? 0);
    const actual = actualByCategory.get(c.id) ?? 0;
    return {
      ...c,
      planned,
      actual,
      remaining: planned - actual,
      // Also flags spending with no plan behind it at all (planned = 0) —
      // unbudgeted spend is exactly as "over" as blowing past a real plan,
      // not exempt from the warning just because there was nothing to
      // compare it to.
      overBudget: actual > planned,
      transactions: transactionsByCategory.get(c.id) ?? [],
    };
  });
}

// For each rollover-enabled category, find the period immediately before
// `period` and carry forward any positive leftover (planned - actual) into
// this period's planned amount. Overspending never reduces next month.
async function getRolloverAmounts(
  period: { start_date: string } | null,
  rolloverCategories: Category[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (!period || rolloverCategories.length === 0) return result;

  const supabase = await createClient();
  const { data: prevPeriod } = await supabase
    .from("periods")
    .select("*")
    .lt("start_date", period.start_date)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!prevPeriod) return result;

  const categoryIds = rolloverCategories.map((c) => c.id);
  const [{ data: prevBudgetLines }, { data: prevTransactions }, debtAccountIds] =
    await Promise.all([
      supabase
        .from("budget_lines")
        .select("category_id, planned_amount")
        .eq("period_id", prevPeriod.id)
        .in("category_id", categoryIds),
      supabase
        .from("transactions")
        .select("id, category_id, amount, account_id, kind")
        .eq("period_id", prevPeriod.id)
        .in("kind", ["income", "expense"])
        .is("deleted_at", null),
      getDebtAccountIds(),
    ]);

  const prevPlanned = new Map<string, number>();
  for (const line of prevBudgetLines ?? []) {
    prevPlanned.set(line.category_id, line.planned_amount);
  }
  const prevActual = new Map<string, number>();
  const splitIds: string[] = [];
  for (const t of prevTransactions ?? []) {
    if (reclassifyKind(t.kind, t.account_id, debtAccountIds) !== "expense") continue;
    if (!t.category_id) {
      splitIds.push(t.id);
      continue;
    }
    if (!categoryIds.includes(t.category_id)) continue;
    prevActual.set(
      t.category_id,
      (prevActual.get(t.category_id) ?? 0) + t.amount,
    );
  }
  await applySplits(splitIds, prevActual);

  for (const id of categoryIds) {
    const leftover = (prevPlanned.get(id) ?? 0) - (prevActual.get(id) ?? 0);
    if (leftover > 0) result.set(id, leftover);
  }
  return result;
}

// Money actively moved into a savings-type account during the range, minus
// any moved back out — a transfer to savings never shows up in income or
// expense (correctly — moving your own money around isn't earning or
// spending it), so income-minus-expense alone makes "how much did I save"
// look like zero even in a month where the household diligently transferred
// money into a savings account. Nets transfers between two savings accounts
// to zero, and skips deposits from unsurfaced starting balances.
export type SavingsTransferTotal = {
  net: number;
  // Gross totals, not net — a $5,000 withdrawal from one savings account
  // and an unrelated $75 deposit into another both stay visible here, since
  // collapsing straight to net (75 - 5000 = -4,925) hid the actual $5,000
  // withdrawal behind an unrelated small deposit elsewhere.
  deposited: number;
  withdrawn: number;
};

export async function getSavingsTransferTotal(
  start: string,
  end: string,
): Promise<SavingsTransferTotal> {
  const supabase = await createClient();
  const [accounts, { data: transactions }] = await Promise.all([
    getAllAccountsRaw(),
    supabase
      .from("transactions")
      .select("amount, account_id, to_account_id")
      .eq("kind", "transfer")
      .gte("txn_date", start)
      .lte("txn_date", end)
      .is("deleted_at", null),
  ]);

  const savingsIds = new Set(
    accounts.filter((a) => a.account_type === "savings").map((a) => a.id),
  );

  let deposited = 0;
  let withdrawn = 0;
  for (const t of transactions ?? []) {
    if (t.to_account_id && savingsIds.has(t.to_account_id)) deposited += t.amount;
    if (t.account_id && savingsIds.has(t.account_id)) withdrawn += t.amount;
  }
  return { net: deposited - withdrawn, deposited, withdrawn };
}

export async function getPeriodSummaryForRange(
  start: string,
  end: string,
): Promise<PeriodSummary> {
  const supabase = await createClient();
  const [{ data }, debtAccountIds] = await Promise.all([
    supabase
      .from("transactions")
      .select("kind, amount, account_id")
      .gte("txn_date", start)
      .lte("txn_date", end)
      .is("deleted_at", null),
    getDebtAccountIds(),
  ]);

  let income = 0;
  let expense = 0;
  for (const t of data ?? []) {
    const kind = reclassifyKind(t.kind, t.account_id, debtAccountIds);
    if (kind === "income") income += t.amount;
    else if (kind === "expense") expense += t.amount;
  }

  const net = income - expense;
  return {
    income,
    expense,
    net,
    savingsRate: income > 0 ? net / income : null,
  };
}

// Same shape as getCategoryProgress, but for an arbitrary date range instead
// of a single period — planned sums every month's budget_lines that overlaps
// the range (a single month for "this/last month", several for 90d/YTD).
export async function getCategoryProgressForRange(
  start: string,
  end: string,
): Promise<CategoryProgress[]> {
  const supabase = await createClient();

  const [
    { data: categories },
    { data: overlappingPeriods },
    { data: transactions },
    debtAccountIds,
  ] = await Promise.all([
    supabase.from("categories").select("*").eq("kind", "expense").order("name"),
    supabase
      .from("periods")
      .select("id")
      .lte("start_date", end)
      .gte("end_date", start),
    supabase
      .from("transactions")
      .select("id, category_id, amount, description, txn_date, account_id, kind")
      .in("kind", ["income", "expense"])
      .gte("txn_date", start)
      .lte("txn_date", end)
      .is("deleted_at", null)
      .order("txn_date", { ascending: false }),
    getDebtAccountIds(),
  ]);

  const periodIds = (overlappingPeriods ?? []).map((p) => p.id);
  const { data: budgetLines } = periodIds.length
    ? await supabase.from("budget_lines").select("*").in("period_id", periodIds)
    : { data: [] as BudgetLine[] };

  const plannedByCategory = new Map<string, number>();
  for (const line of (budgetLines ?? []) as BudgetLine[]) {
    plannedByCategory.set(
      line.category_id,
      (plannedByCategory.get(line.category_id) ?? 0) + line.planned_amount,
    );
  }

  const actualByCategory = new Map<string, number>();
  const transactionsByCategory = new Map<
    string,
    { id: string; description: string; amount: number; txn_date: string }[]
  >();
  const splitTransactionIds: string[] = [];
  for (const t of (transactions ?? []) as Pick<
    Transaction,
    "id" | "category_id" | "amount" | "description" | "txn_date" | "account_id" | "kind"
  >[]) {
    if (reclassifyKind(t.kind, t.account_id, debtAccountIds) !== "expense") continue;
    if (!t.category_id) {
      splitTransactionIds.push(t.id);
      continue;
    }
    actualByCategory.set(
      t.category_id,
      (actualByCategory.get(t.category_id) ?? 0) + t.amount,
    );
    const list = transactionsByCategory.get(t.category_id) ?? [];
    list.push({
      id: t.id,
      description: t.description,
      amount: t.amount,
      txn_date: t.txn_date,
    });
    transactionsByCategory.set(t.category_id, list);
  }
  await applySplits(splitTransactionIds, actualByCategory);

  return ((categories ?? []) as Category[]).map((c) => {
    const planned = plannedByCategory.get(c.id) ?? 0;
    const actual = actualByCategory.get(c.id) ?? 0;
    return {
      ...c,
      planned,
      actual,
      remaining: planned - actual,
      // Also flags spending with no plan behind it at all (planned = 0) —
      // unbudgeted spend is exactly as "over" as blowing past a real plan,
      // not exempt from the warning just because there was nothing to
      // compare it to.
      overBudget: actual > planned,
      transactions: transactionsByCategory.get(c.id) ?? [],
    };
  });
}

export async function getTransactionsForRange(
  start: string,
  end: string,
): Promise<Transaction[]> {
  const supabase = await createClient();
  // Paginated — callers can pass a wide range (a full year via the reports
  // "custom" picker, say), and this household's transaction count is
  // already past PostgREST's 1000-row default cap, which would otherwise
  // silently drop the oldest matching rows with no error.
  const rows: Transaction[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .gte("txn_date", start)
      .lte("txn_date", end)
      .is("deleted_at", null)
      .order("txn_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
    from += 1000;
  }
  return rows;
}

export type MonthlyTotal = { month: string; income: number; expense: number };

// One row per calendar month in [start, end], even a month with zero
// activity, so a year-to-date chart never silently skips a quiet month.
export async function getMonthlyTotals(
  start: string,
  end: string,
): Promise<MonthlyTotal[]> {
  const supabase = await createClient();
  const [{ data, error }, debtAccountIds] = await Promise.all([
    supabase
      .from("transactions")
      .select("kind, amount, txn_date, account_id")
      .gte("txn_date", start)
      .lte("txn_date", end)
      .is("deleted_at", null)
      .in("kind", ["income", "expense"]),
    getDebtAccountIds(),
  ]);
  if (error) throw error;

  const byMonth = new Map<string, { income: number; expense: number }>();
  for (const t of data ?? []) {
    const kind = reclassifyKind(t.kind, t.account_id, debtAccountIds);
    if (!kind) continue;
    const month = t.txn_date.slice(0, 7);
    const bucket = byMonth.get(month) ?? { income: 0, expense: 0 };
    if (kind === "income") bucket.income += t.amount;
    else bucket.expense += t.amount;
    byMonth.set(month, bucket);
  }

  const months: MonthlyTotal[] = [];
  const cursor = new Date(`${start.slice(0, 7)}-01T00:00:00Z`);
  const endCursor = new Date(`${end.slice(0, 7)}-01T00:00:00Z`);
  while (cursor <= endCursor) {
    const key = cursor.toISOString().slice(0, 7);
    months.push({
      month: key,
      ...(byMonth.get(key) ?? { income: 0, expense: 0 }),
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

export type RecurringVsOther = { recurring: number; other: number };

// Splits each month's expense total into "recurring" (linked to a
// recurring_transactions entry) vs. everything else, so a chart can show
// how much of a month's spend is fixed bills vs. discretionary.
export async function getRecurringVsOtherByMonth(
  start: string,
  end: string,
): Promise<Map<string, RecurringVsOther>> {
  const supabase = await createClient();
  const [{ data, error }, debtAccountIds] = await Promise.all([
    supabase
      .from("transactions")
      .select("amount, txn_date, recurring_transaction_id, account_id, kind")
      .in("kind", ["income", "expense"])
      .gte("txn_date", start)
      .lte("txn_date", end)
      .is("deleted_at", null),
    getDebtAccountIds(),
  ]);
  if (error) throw error;

  const byMonth = new Map<string, RecurringVsOther>();
  for (const t of data ?? []) {
    if (reclassifyKind(t.kind, t.account_id, debtAccountIds) !== "expense") continue;
    const month = t.txn_date.slice(0, 7);
    const bucket = byMonth.get(month) ?? { recurring: 0, other: 0 };
    if (t.recurring_transaction_id) bucket.recurring += t.amount;
    else bucket.other += t.amount;
    byMonth.set(month, bucket);
  }
  return byMonth;
}

// Sum of planned amounts (expense categories only) for a set of periods, so
// a chart can show "planned" alongside "actual" per month.
export async function getPlannedTotalsByPeriod(
  periodIds: string[],
): Promise<Map<string, number>> {
  if (periodIds.length === 0) return new Map();
  const supabase = await createClient();
  const [{ data: lines, error }, categories] = await Promise.all([
    supabase
      .from("budget_lines")
      .select("period_id, category_id, planned_amount")
      .in("period_id", periodIds),
    getAllCategoriesRaw(),
  ]);
  if (error) throw error;

  const expenseCategoryIds = new Set(
    categories.filter((c) => c.kind === "expense").map((c) => c.id),
  );
  const byPeriod = new Map<string, number>();
  for (const l of lines ?? []) {
    if (!expenseCategoryIds.has(l.category_id)) continue;
    byPeriod.set(
      l.period_id,
      (byPeriod.get(l.period_id) ?? 0) + l.planned_amount,
    );
  }
  return byPeriod;
}

// Same cumulative-balance approach as getNetWorthHistory, but scoped to
// is_debt accounts only and NOT netting out transfers — a transfer into a
// specific debt account changes that account's own balance even though it
// doesn't move total household net worth.
export async function getDebtBalanceHistory(): Promise<NetWorthPoint[]> {
  const supabase = await createClient();
  const [accounts, { data: periods }, transactions] = await Promise.all([
    getAllAccountsRaw(),
    supabase
      .from("periods")
      .select("*")
      .order("start_date", { ascending: true }),
    fetchAllTransactionRows(),
  ]);

  const debtAccountIds = new Set(
    accounts.filter((a) => a.is_debt).map((a) => a.id),
  );
  const balanceByAccount = new Map<string, number>();
  for (const a of accounts) {
    if (debtAccountIds.has(a.id))
      balanceByAccount.set(a.id, a.starting_balance);
  }

  const sorted = transactions
    .slice()
    .sort((a, b) => a.txn_date.localeCompare(b.txn_date));
  let txnIndex = 0;
  const points: NetWorthPoint[] = [];

  for (const period of (periods ?? []) as {
    id: string;
    name: string;
    end_date: string;
  }[]) {
    while (
      txnIndex < sorted.length &&
      sorted[txnIndex].txn_date <= period.end_date
    ) {
      const t = sorted[txnIndex];
      if (t.kind === "transfer") {
        // `balanceByAccount` only ever holds debt accounts here, so every
        // match below is one — and a transfer's effect on "amount owed" is
        // the opposite of what it'd be on a normal account: money moving
        // OUT of a card (a cash advance) increases what's owed, and money
        // moving IN (a payment) decreases it.
        if (t.account_id && balanceByAccount.has(t.account_id)) {
          balanceByAccount.set(
            t.account_id,
            balanceByAccount.get(t.account_id)! + t.amount,
          );
        }
        if (t.to_account_id && balanceByAccount.has(t.to_account_id)) {
          balanceByAccount.set(
            t.to_account_id,
            balanceByAccount.get(t.to_account_id)! - t.amount,
          );
        }
      } else if (t.account_id && balanceByAccount.has(t.account_id)) {
        const delta = t.kind === "income" ? t.amount : -t.amount;
        balanceByAccount.set(
          t.account_id,
          balanceByAccount.get(t.account_id)! + delta,
        );
      }
      txnIndex += 1;
    }
    const total = [...balanceByAccount.values()].reduce((sum, v) => sum + v, 0);
    points.push({
      periodId: period.id,
      periodName: period.name,
      endDate: period.end_date,
      netWorth: total,
    });
  }

  return points;
}

export type TopCategoryByMonth = {
  month: string;
  categoryName: string;
  amount: number;
} | null;

// The single biggest expense category per month, for a "what drove the
// spike" callout next to the income/expense chart.
export async function getTopCategoryByMonth(
  start: string,
  end: string,
): Promise<Map<string, TopCategoryByMonth>> {
  const supabase = await createClient();
  const [{ data: rows, error }, categories, debtAccountIds] = await Promise.all([
    supabase
      .from("transactions")
      .select("amount, txn_date, category_id, account_id, kind")
      .in("kind", ["income", "expense"])
      .not("category_id", "is", null)
      .gte("txn_date", start)
      .lte("txn_date", end)
      .is("deleted_at", null),
    getAllCategoriesRaw(),
    getDebtAccountIds(),
  ]);
  if (error) throw error;

  const nameById = new Map(categories.map((c) => [c.id, c.name]));
  const byMonthCategory = new Map<string, Map<string, number>>();
  for (const t of rows ?? []) {
    if (reclassifyKind(t.kind, t.account_id, debtAccountIds) !== "expense") continue;
    const month = t.txn_date.slice(0, 7);
    const byCategory = byMonthCategory.get(month) ?? new Map<string, number>();
    byCategory.set(
      t.category_id!,
      (byCategory.get(t.category_id!) ?? 0) + t.amount,
    );
    byMonthCategory.set(month, byCategory);
  }

  const result = new Map<string, TopCategoryByMonth>();
  for (const [month, byCategory] of byMonthCategory) {
    let top: { categoryId: string; amount: number } | null = null;
    for (const [categoryId, amount] of byCategory) {
      // A household's own "Transfers" category (money moved to savings,
      // between accounts, etc.) isn't spending — it shouldn't win "what
      // drove this month's spike" just because it nets large.
      if (/transfer/i.test(nameById.get(categoryId) ?? "")) continue;
      if (!top || amount > top.amount) top = { categoryId, amount };
    }
    result.set(
      month,
      top
        ? {
            month,
            categoryName: nameById.get(top.categoryId) ?? "—",
            amount: top.amount,
          }
        : null,
    );
  }
  return result;
}

export async function getCategories(): Promise<Category[]> {
  const categories = await getAllCategoriesRaw();
  return [...categories].sort(
    (a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name),
  );
}

export async function getObjectives(): Promise<Objective[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("objectives")
    .select("*")
    .order("start_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export type SplitDetail = { category_id: string | null; amount: number };

// A split transaction stores category_id: null on the parent row, which
// otherwise looks identical to a plain uncategorized transaction — this lets
// the transactions table tell the two apart and show what it's split into.
export async function getSplitsByTransaction(
  transactionIds: string[],
): Promise<Map<string, SplitDetail[]>> {
  if (transactionIds.length === 0) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("transaction_splits")
    .select("transaction_id, category_id, amount")
    .in("transaction_id", transactionIds);
  if (error) throw error;

  const byTransaction = new Map<string, SplitDetail[]>();
  for (const s of data ?? []) {
    const list = byTransaction.get(s.transaction_id) ?? [];
    list.push({ category_id: s.category_id, amount: s.amount });
    byTransaction.set(s.transaction_id, list);
  }
  return byTransaction;
}

export async function getTransactions(
  periodId: string,
): Promise<Transaction[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("transactions")
    .select("*")
    .eq("period_id", periodId)
    .is("deleted_at", null)
    .order("txn_date", { ascending: false })
    .order("created_at", { ascending: false });
  return data ?? [];
}

// Same account, same exact amount, within 2 days either way — catches the
// classic "we both logged it" double-entry without being so loose it flags
// unrelated same-amount purchases weeks apart.
export async function findPossibleDuplicateTransactions(
  account_id: string,
  amount: number,
  txn_date: string,
  excludeId?: string,
): Promise<
  Pick<
    Transaction,
    "id" | "description" | "amount" | "txn_date" | "created_by_email"
  >[]
> {
  if (!account_id || !amount || !txn_date) return [];
  const supabase = await createClient();

  const center = new Date(`${txn_date}T00:00:00Z`);
  const before = new Date(center);
  before.setUTCDate(before.getUTCDate() - 2);
  const after = new Date(center);
  after.setUTCDate(after.getUTCDate() + 2);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  let query = supabase
    .from("transactions")
    .select("id, description, amount, txn_date, created_by_email")
    .eq("account_id", account_id)
    .eq("amount", amount)
    .gte("txn_date", iso(before))
    .lte("txn_date", iso(after))
    .is("deleted_at", null);

  if (excludeId) query = query.neq("id", excludeId);

  const { data } = await query;
  return data ?? [];
}

export type TransactionSearchResult = {
  id: string;
  kind: Transaction["kind"];
  description: string;
  notes: string | null;
  amount: number;
  txn_date: string;
  period_id: string;
  category_name: string | null;
  account_name: string | null;
  to_account_name: string | null;
};

// Backs the ⌘K command palette's transaction search — matches description,
// notes, category name, account name, or an exact dollar amount, across
// every non-deleted transaction ever logged (not scoped to one period),
// since "find the specific transaction" only works if it can find it
// anywhere.
export async function searchTransactions(
  rawQuery: string,
): Promise<TransactionSearchResult[]> {
  const q = rawQuery.trim();
  if (q.length < 2) return [];
  const supabase = await createClient();

  // Commas/parens are syntactically significant in PostgREST's `.or()`
  // mini-language — strip them out of the user-typed query so they can't be
  // (mis)interpreted as extra filter clauses instead of literal text.
  const safe = q.replace(/[,()]/g, " ").trim();
  if (!safe) return [];

  const [{ data: matchingCategories }, { data: matchingAccounts }] =
    await Promise.all([
      supabase.from("categories").select("id, name").ilike("name", `%${safe}%`),
      supabase.from("accounts").select("id, name").ilike("name", `%${safe}%`),
    ]);
  const categoryIds = (matchingCategories ?? []).map((c) => c.id);
  const accountIds = (matchingAccounts ?? []).map((a) => a.id);

  // A query that's purely a number (e.g. "64.20" or "$64.20") also matches
  // on exact amount — the single most common way to remember a transaction.
  const numeric = Number(safe.replace(/[^0-9.]/g, ""));
  const hasAmount = /\d/.test(safe) && Number.isFinite(numeric) && numeric > 0;

  const orParts = [`description.ilike.%${safe}%`, `notes.ilike.%${safe}%`];
  if (categoryIds.length > 0) {
    orParts.push(`category_id.in.(${categoryIds.join(",")})`);
  }
  if (accountIds.length > 0) {
    orParts.push(`account_id.in.(${accountIds.join(",")})`);
    orParts.push(`to_account_id.in.(${accountIds.join(",")})`);
  }
  if (hasAmount) {
    orParts.push(`amount.eq.${numeric}`);
  }

  const { data, error } = await supabase
    .from("transactions")
    .select(
      "id, kind, description, notes, amount, txn_date, period_id, account_id, to_account_id, category_id",
    )
    .is("deleted_at", null)
    .or(orParts.join(","))
    .order("txn_date", { ascending: false })
    .limit(20);

  if (error) {
    console.error("searchTransactions failed:", error);
    return [];
  }

  // Enrich with names for display — reuse whichever category/account rows
  // we already fetched above for the id-matching, and only fetch the
  // (usually few) additional ones referenced by results but not matched by
  // name themselves (e.g. searching "Whole Foods" matches by description,
  // but the result still needs its category's name to display).
  const categoryById = new Map((matchingCategories ?? []).map((c) => [c.id, c.name]));
  const accountById = new Map((matchingAccounts ?? []).map((a) => [a.id, a.name]));
  const rows = data ?? [];
  const missingCategoryIds = [
    ...new Set(
      rows
        .map((t) => t.category_id)
        .filter((id): id is string => !!id && !categoryById.has(id)),
    ),
  ];
  const missingAccountIds = [
    ...new Set(
      rows
        .flatMap((t) => [t.account_id, t.to_account_id])
        .filter((id): id is string => !!id && !accountById.has(id)),
    ),
  ];
  const [{ data: extraCategories }, { data: extraAccounts }] = await Promise.all([
    missingCategoryIds.length > 0
      ? supabase.from("categories").select("id, name").in("id", missingCategoryIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    missingAccountIds.length > 0
      ? supabase.from("accounts").select("id, name").in("id", missingAccountIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  for (const c of extraCategories ?? []) categoryById.set(c.id, c.name);
  for (const a of extraAccounts ?? []) accountById.set(a.id, a.name);

  return rows.map((t) => ({
    id: t.id,
    kind: t.kind,
    description: t.description,
    notes: t.notes,
    amount: t.amount,
    txn_date: t.txn_date,
    period_id: t.period_id,
    category_name: t.category_id ? (categoryById.get(t.category_id) ?? null) : null,
    account_name: t.account_id ? (accountById.get(t.account_id) ?? null) : null,
    to_account_name: t.to_account_id ? (accountById.get(t.to_account_id) ?? null) : null,
  }));
}

export async function getRecurringTransactions(): Promise<
  RecurringTransaction[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recurring_transactions")
    .select("*")
    .order("day_of_month");
  if (error) throw error;
  return data ?? [];
}

// Which recurring items already have a generated transaction in this period,
// so the Recurring page can show a reconciliation status instead of just a
// static list that's disconnected from what's actually been posted.
export async function getPostedRecurringIds(
  periodId: string,
): Promise<Set<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("transactions")
    .select("recurring_transaction_id")
    .eq("period_id", periodId)
    .not("recurring_transaction_id", "is", null)
    .is("deleted_at", null);
  if (error) throw error;
  return new Set((data ?? []).map((t) => t.recurring_transaction_id as string));
}

export type NetWorthPoint = {
  periodId: string;
  periodName: string;
  endDate: string;
  netWorth: number;
};

// Cumulative balance across all accounts as of the end of each period,
// oldest first, for a balance-over-time chart.
export async function getNetWorthHistory(): Promise<NetWorthPoint[]> {
  const supabase = await createClient();
  const [accounts, { data: periods }, transactions] = await Promise.all([
    getAllAccountsRaw(),
    supabase
      .from("periods")
      .select("*")
      .order("start_date", { ascending: true }),
    fetchAllTransactionRows(),
  ]);

  // Active-only, matching how the dashboard's "Net Worth" figure this
  // feeds a trend comparison for is computed — otherwise a deactivated
  // account's starting balance and history keep permanently inflating (or
  // deflating) every past period's net worth even though that account no
  // longer counts toward the current total, corrupting the up/down trend.
  const activeAccountIds = new Set(
    accounts.filter((a) => a.is_active).map((a) => a.id),
  );
  // A debt account's balance is money owed — a liability, not an asset — so
  // it subtracts from net worth instead of adding, both for its starting
  // balance and for every charge/payment logged directly on it afterward
  // (a charge = kind "income" = owe more = net worth down; a payment =
  // kind "expense" = owe less = net worth up — the opposite of what those
  // kinds mean for a normal account). Transfers stay untouched below: they
  // already net to zero for total net worth regardless of which side is a
  // debt account, so they're correctly skipped entirely already.
  const debtAccountIds = new Set(
    accounts.filter((a) => a.is_debt).map((a) => a.id),
  );
  const startingTotal = accounts
    .filter((a) => a.is_active)
    .reduce(
      (sum, a) => sum + (a.is_debt ? -a.starting_balance : a.starting_balance),
      0,
    );
  const sorted = transactions
    .filter((t) => t.account_id !== null && activeAccountIds.has(t.account_id))
    .slice()
    .sort((a, b) => a.txn_date.localeCompare(b.txn_date));

  let runningTotal = startingTotal;
  let txnIndex = 0;
  const points: NetWorthPoint[] = [];

  for (const period of (periods ?? []) as {
    id: string;
    name: string;
    end_date: string;
  }[]) {
    while (
      txnIndex < sorted.length &&
      sorted[txnIndex].txn_date <= period.end_date
    ) {
      const t = sorted[txnIndex];
      const isDebt = t.account_id !== null && debtAccountIds.has(t.account_id);
      if (t.kind === "income") runningTotal += isDebt ? -t.amount : t.amount;
      else if (t.kind === "expense") runningTotal += isDebt ? t.amount : -t.amount;
      txnIndex += 1;
    }
    points.push({
      periodId: period.id,
      periodName: period.name,
      endDate: period.end_date,
      netWorth: runningTotal,
    });
  }

  return points;
}

export type BalancePoint = { date: string; balance: number };

// Daily running total balance across every account for the last `days` days
// (today inclusive), for a small balance-over-time sparkline.
export async function getBalanceHistory(days: number): Promise<BalancePoint[]> {
  const [accounts, transactions] = await Promise.all([
    getAllAccountsRaw(),
    fetchAllTransactionRows(),
  ]);

  // Match the "Net Worth" figure this graphs — activeAccounts only, so
  // a deactivated/closed account (and its transaction history) doesn't keep
  // dragging the line even though it's excluded from the headline number.
  const activeAccountIds = new Set(
    accounts.filter((a) => a.is_active).map((a) => a.id),
  );
  // See getNetWorthHistory just above — a debt account's balance is a
  // liability, so it (and every charge/payment on it) subtracts from this
  // total instead of adding, the opposite of what "income"/"expense" mean
  // on a normal account. Transfers already net to zero for the total either
  // way, so they're correctly left untouched below.
  const debtAccountIds = new Set(
    accounts.filter((a) => a.is_debt).map((a) => a.id),
  );
  const startingTotal = accounts
    .filter((a) => a.is_active)
    .reduce(
      (sum, a) => sum + (a.is_debt ? -a.starting_balance : a.starting_balance),
      0,
    );
  const sorted = transactions
    .filter((t) => t.account_id !== null && activeAccountIds.has(t.account_id))
    .slice()
    .sort((a, b) => a.txn_date.localeCompare(b.txn_date));

  const todayIso = new Date().toISOString().slice(0, 10);
  const end = new Date(`${todayIso}T00:00:00Z`);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  const startIso = start.toISOString().slice(0, 10);

  // Fold in every transaction that happened before the window starts, so the
  // first point reflects the real running balance rather than starting_balance.
  let runningTotal = startingTotal;
  let txnIndex = 0;
  while (txnIndex < sorted.length && sorted[txnIndex].txn_date < startIso) {
    const t = sorted[txnIndex];
    const isDebt = t.account_id !== null && debtAccountIds.has(t.account_id);
    if (t.kind === "income") runningTotal += isDebt ? -t.amount : t.amount;
    else if (t.kind === "expense") runningTotal += isDebt ? t.amount : -t.amount;
    txnIndex += 1;
  }

  const points: BalancePoint[] = [];
  for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    while (txnIndex < sorted.length && sorted[txnIndex].txn_date <= iso) {
      const t = sorted[txnIndex];
      const isDebt = t.account_id !== null && debtAccountIds.has(t.account_id);
      if (t.kind === "income") runningTotal += isDebt ? -t.amount : t.amount;
      else if (t.kind === "expense") runningTotal += isDebt ? t.amount : -t.amount;
      txnIndex += 1;
    }
    points.push({ date: iso, balance: runningTotal });
  }

  return points;
}

export type BudgetGridRow = {
  category: Category;
  plannedByPeriod: Map<string, number>;
};

// Categories x periods matrix of planned amounts for multi-month planning.
export async function getBudgetGrid(
  periodIds: string[],
): Promise<BudgetGridRow[]> {
  const supabase = await createClient();
  const [{ data: categories }, { data: budgetLines }] = await Promise.all([
    supabase.from("categories").select("*").eq("kind", "expense").order("name"),
    periodIds.length
      ? supabase.from("budget_lines").select("*").in("period_id", periodIds)
      : Promise.resolve({ data: [] as BudgetLine[] }),
  ]);

  const byCategory = new Map<string, Map<string, number>>();
  for (const line of (budgetLines ?? []) as BudgetLine[]) {
    const map = byCategory.get(line.category_id) ?? new Map<string, number>();
    map.set(line.period_id, line.planned_amount);
    byCategory.set(line.category_id, map);
  }

  return ((categories ?? []) as Category[]).map((category) => ({
    category,
    plannedByPeriod: byCategory.get(category.id) ?? new Map<string, number>(),
  }));
}

// Suggests a category based on the most common category previously used for
// transactions with a similar (case-insensitive, exact-match) description.
export async function suggestCategoryForDescription(
  description: string,
): Promise<string | null> {
  const trimmed = description.trim();
  if (!trimmed) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("transactions")
    .select("category_id")
    .ilike("description", trimmed)
    .not("category_id", "is", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(20);

  if (!data || data.length === 0) return null;
  const counts = new Map<string, number>();
  for (const row of data) {
    if (!row.category_id) continue;
    counts.set(row.category_id, (counts.get(row.category_id) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [categoryId, count] of counts) {
    if (count > bestCount) {
      best = categoryId;
      bestCount = count;
    }
  }
  return best;
}

// Money left to freely spend this period: what's still unspent of the
// planned budget, minus bills that haven't posted yet this month. Only
// counts recurring items dated later than today that haven't already
// generated a transaction this period, so already-posted bills (already
// reflected in `actual`) aren't subtracted twice.
export async function getSafeToSpend(periodId: string): Promise<number> {
  const supabase = await createClient();
  const [categoryProgress, { data: period }] = await Promise.all([
    getCategoryProgress(periodId),
    supabase.from("periods").select("*").eq("id", periodId).single(),
  ]);

  const remainingBudget = categoryProgress.reduce(
    (sum, c) => sum + Math.max(0, c.remaining),
    0,
  );
  if (!period) return remainingBudget;

  const today = new Date().toISOString().slice(0, 10);
  const isCurrentPeriod =
    period.start_date <= today && period.end_date >= today;
  if (!isCurrentPeriod) return remainingBudget;

  const todayDay = Number(today.slice(8, 10));
  const [{ data: recurring }, postedIds] = await Promise.all([
    supabase
      .from("recurring_transactions")
      .select("id, amount, day_of_month")
      .eq("kind", "expense")
      .eq("is_active", true)
      .gt("day_of_month", todayDay),
    getPostedRecurringIds(periodId),
  ]);

  const upcoming = (recurring ?? [])
    .filter((r) => !postedIds.has(r.id))
    .reduce((sum, r) => sum + r.amount, 0);

  return remainingBudget - upcoming;
}

export type UpcomingBill = {
  id: string;
  description: string;
  amount: number;
  day_of_month: number;
  account_id: string | null;
  category_id: string | null;
  due: boolean;
};

// Active expense bills that haven't posted yet this period, for a dashboard
// "what's coming up" glance — `due` (day_of_month already passed but no
// transaction generated) surfaces before merely `upcoming` ones.
export async function getUpcomingBills(
  periodId: string,
): Promise<UpcomingBill[]> {
  const supabase = await createClient();
  const todayDay = Number(new Date().toISOString().slice(8, 10));
  const [{ data: recurring }, postedIds] = await Promise.all([
    supabase
      .from("recurring_transactions")
      .select("id, description, amount, day_of_month, account_id, category_id")
      .eq("kind", "expense")
      .eq("is_active", true),
    getPostedRecurringIds(periodId),
  ]);

  return (recurring ?? [])
    .filter((r) => !postedIds.has(r.id))
    .map((r) => ({ ...r, due: r.day_of_month <= todayDay }))
    .sort((a, b) => {
      if (a.due !== b.due) return a.due ? -1 : 1;
      return a.day_of_month - b.day_of_month;
    });
}

export type RecurringPricePoint = { txn_date: string; amount: number };

// Amount history for a single recurring bill, oldest first, drawn from the
// transactions it actually generated — surfaces creeping price changes
// (e.g. a subscription that went up twice this year).
export async function getRecurringPriceHistory(
  recurringId: string,
): Promise<RecurringPricePoint[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("transactions")
    .select("txn_date, amount")
    .eq("recurring_transaction_id", recurringId)
    .is("deleted_at", null)
    .order("txn_date", { ascending: true });
  return data ?? [];
}

export async function getTransactionHistory(
  transactionId: string,
): Promise<TransactionHistoryEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("transaction_history")
    .select("*")
    .eq("transaction_id", transactionId)
    .order("edited_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export type MonthlyFlowPoint = {
  periodId: string;
  label: string;
  income: number;
  expense: number;
};

// Income/expense totals per period, oldest first, for the Money Flow bar
// chart — separate from getNetWorthHistory, which tracks cumulative balance
// rather than each month's flow.
export async function getMonthlyFlow(limit = 12): Promise<MonthlyFlowPoint[]> {
  const supabase = await createClient();
  const { data: periods } = await supabase
    .from("periods")
    .select("id, name, start_date")
    .order("start_date", { ascending: false })
    .limit(limit);

  const ordered = (periods ?? []).slice().reverse();
  const periodIds = ordered.map((p) => p.id);

  // One transactions fetch for every period in view instead of one
  // getPeriodSummary() call (its own transactions query) per period — same
  // class of fix as getNetWorthHistory/getDebtBalanceHistory's single-fetch
  // approach.
  const [{ data: rows }, debtAccountIds] = await Promise.all([
    periodIds.length
      ? supabase
          .from("transactions")
          .select("period_id, kind, amount, account_id")
          .in("period_id", periodIds)
          .is("deleted_at", null)
      : Promise.resolve({ data: [] }),
    getDebtAccountIds(),
  ]);

  const byPeriod = new Map<string, { income: number; expense: number }>();
  for (const t of rows ?? []) {
    if (!t.period_id) continue;
    const kind = reclassifyKind(t.kind, t.account_id, debtAccountIds);
    if (!kind) continue;
    const entry = byPeriod.get(t.period_id) ?? { income: 0, expense: 0 };
    if (kind === "income") entry.income += t.amount;
    else entry.expense += t.amount;
    byPeriod.set(t.period_id, entry);
  }

  return ordered.map((p) => ({
    periodId: p.id,
    label: p.name.split(" ")[0]?.slice(0, 3) ?? p.name,
    income: byPeriod.get(p.id)?.income ?? 0,
    expense: byPeriod.get(p.id)?.expense ?? 0,
  }));
}
