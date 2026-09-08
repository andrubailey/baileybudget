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
async function fetchAllTransactionDeltas(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<
  {
    account_id: string | null;
    to_account_id: string | null;
    kind: string;
    amount: number;
  }[]
> {
  const rows: {
    account_id: string | null;
    to_account_id: string | null;
    kind: string;
    amount: number;
  }[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("transactions")
      .select("account_id, to_account_id, kind, amount")
      .is("deleted_at", null)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

export async function getAccountsWithBalances(): Promise<AccountWithBalance[]> {
  const supabase = await createClient();

  const [{ data: accounts, error: accountsError }, transactions] =
    await Promise.all([
      supabase
        .from("accounts")
        .select("*")
        .order("sort_order")
        .order("created_at"),
      fetchAllTransactionDeltas(supabase),
    ]);

  // A query error here (e.g. a pending migration) must not silently fall back
  // to starting_balance only — that looks exactly like lost account history.
  if (accountsError) throw accountsError;

  const deltaByAccount = new Map<string, number>();
  for (const t of transactions ?? []) {
    if (t.kind === "transfer") {
      if (t.account_id) {
        deltaByAccount.set(
          t.account_id,
          (deltaByAccount.get(t.account_id) ?? 0) - t.amount,
        );
      }
      if (t.to_account_id) {
        deltaByAccount.set(
          t.to_account_id,
          (deltaByAccount.get(t.to_account_id) ?? 0) + t.amount,
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

export async function getPeriodSummary(
  periodId: string,
): Promise<PeriodSummary> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("transactions")
    .select("kind, amount")
    .eq("period_id", periodId)
    .is("deleted_at", null);

  let income = 0;
  let expense = 0;
  for (const t of data ?? []) {
    if (t.kind === "income") income += t.amount;
    else if (t.kind === "expense") expense += t.amount;
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
  ] = await Promise.all([
    supabase.from("periods").select("*").eq("id", periodId).single(),
    supabase.from("categories").select("*").eq("kind", "expense").order("name"),
    supabase.from("budget_lines").select("*").eq("period_id", periodId),
    supabase
      .from("transactions")
      .select("id, category_id, amount, description, txn_date")
      .eq("period_id", periodId)
      .eq("kind", "expense")
      .is("deleted_at", null)
      .order("txn_date", { ascending: false }),
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
    "id" | "category_id" | "amount" | "description" | "txn_date"
  >[]) {
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
      overBudget: actual > planned && planned > 0,
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
  const [{ data: prevBudgetLines }, { data: prevTransactions }] =
    await Promise.all([
      supabase
        .from("budget_lines")
        .select("category_id, planned_amount")
        .eq("period_id", prevPeriod.id)
        .in("category_id", categoryIds),
      supabase
        .from("transactions")
        .select("id, category_id, amount")
        .eq("period_id", prevPeriod.id)
        .eq("kind", "expense")
        .is("deleted_at", null),
    ]);

  const prevPlanned = new Map<string, number>();
  for (const line of prevBudgetLines ?? []) {
    prevPlanned.set(line.category_id, line.planned_amount);
  }
  const prevActual = new Map<string, number>();
  const splitIds: string[] = [];
  for (const t of prevTransactions ?? []) {
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

export async function getPeriodSummaryForRange(
  start: string,
  end: string,
): Promise<PeriodSummary> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("transactions")
    .select("kind, amount")
    .gte("txn_date", start)
    .lte("txn_date", end)
    .is("deleted_at", null);

  let income = 0;
  let expense = 0;
  for (const t of data ?? []) {
    if (t.kind === "income") income += t.amount;
    else if (t.kind === "expense") expense += t.amount;
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
  ] = await Promise.all([
    supabase.from("categories").select("*").eq("kind", "expense").order("name"),
    supabase
      .from("periods")
      .select("id")
      .lte("start_date", end)
      .gte("end_date", start),
    supabase
      .from("transactions")
      .select("id, category_id, amount, description, txn_date")
      .eq("kind", "expense")
      .gte("txn_date", start)
      .lte("txn_date", end)
      .is("deleted_at", null)
      .order("txn_date", { ascending: false }),
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
    "id" | "category_id" | "amount" | "description" | "txn_date"
  >[]) {
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
      overBudget: actual > planned && planned > 0,
      transactions: transactionsByCategory.get(c.id) ?? [],
    };
  });
}

export async function getTransactionsForRange(
  start: string,
  end: string,
): Promise<Transaction[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("transactions")
    .select("*")
    .gte("txn_date", start)
    .lte("txn_date", end)
    .is("deleted_at", null)
    .order("txn_date", { ascending: false })
    .order("created_at", { ascending: false });
  return data ?? [];
}

export type MonthlyTotal = { month: string; income: number; expense: number };

// One row per calendar month in [start, end], even a month with zero
// activity, so a year-to-date chart never silently skips a quiet month.
export async function getMonthlyTotals(
  start: string,
  end: string,
): Promise<MonthlyTotal[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("transactions")
    .select("kind, amount, txn_date")
    .gte("txn_date", start)
    .lte("txn_date", end)
    .is("deleted_at", null)
    .in("kind", ["income", "expense"]);
  if (error) throw error;

  const byMonth = new Map<string, { income: number; expense: number }>();
  for (const t of data ?? []) {
    const month = t.txn_date.slice(0, 7);
    const bucket = byMonth.get(month) ?? { income: 0, expense: 0 };
    if (t.kind === "income") bucket.income += t.amount;
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
  const { data, error } = await supabase
    .from("transactions")
    .select("amount, txn_date, recurring_transaction_id")
    .eq("kind", "expense")
    .gte("txn_date", start)
    .lte("txn_date", end)
    .is("deleted_at", null);
  if (error) throw error;

  const byMonth = new Map<string, RecurringVsOther>();
  for (const t of data ?? []) {
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
  const [{ data: lines, error }, { data: categories }] = await Promise.all([
    supabase
      .from("budget_lines")
      .select("period_id, category_id, planned_amount")
      .in("period_id", periodIds),
    supabase.from("categories").select("id, kind"),
  ]);
  if (error) throw error;

  const expenseCategoryIds = new Set(
    (categories ?? []).filter((c) => c.kind === "expense").map((c) => c.id),
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
  const [{ data: accounts }, { data: periods }, { data: transactions }] =
    await Promise.all([
      supabase.from("accounts").select("id, starting_balance, is_debt"),
      supabase
        .from("periods")
        .select("*")
        .order("start_date", { ascending: true }),
      supabase
        .from("transactions")
        .select("account_id, to_account_id, kind, amount, txn_date")
        .is("deleted_at", null)
        .order("txn_date", { ascending: true }),
    ]);

  const debtAccountIds = new Set(
    (accounts ?? []).filter((a) => a.is_debt).map((a) => a.id),
  );
  const balanceByAccount = new Map<string, number>();
  for (const a of accounts ?? []) {
    if (debtAccountIds.has(a.id))
      balanceByAccount.set(a.id, a.starting_balance);
  }

  const sorted = (transactions ?? [])
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
        if (t.account_id && balanceByAccount.has(t.account_id)) {
          balanceByAccount.set(
            t.account_id,
            balanceByAccount.get(t.account_id)! - t.amount,
          );
        }
        if (t.to_account_id && balanceByAccount.has(t.to_account_id)) {
          balanceByAccount.set(
            t.to_account_id,
            balanceByAccount.get(t.to_account_id)! + t.amount,
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
  const [{ data: rows, error }, { data: categories }] = await Promise.all([
    supabase
      .from("transactions")
      .select("amount, txn_date, category_id")
      .eq("kind", "expense")
      .not("category_id", "is", null)
      .gte("txn_date", start)
      .lte("txn_date", end)
      .is("deleted_at", null),
    supabase.from("categories").select("id, name"),
  ]);
  if (error) throw error;

  const nameById = new Map((categories ?? []).map((c) => [c.id, c.name]));
  const byMonthCategory = new Map<string, Map<string, number>>();
  for (const t of rows ?? []) {
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
  const supabase = await createClient();
  const { data } = await supabase
    .from("categories")
    .select("*")
    .order("kind")
    .order("name");
  return data ?? [];
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
  const [{ data: accounts }, { data: periods }, { data: transactions }] =
    await Promise.all([
      supabase.from("accounts").select("id, starting_balance"),
      supabase
        .from("periods")
        .select("*")
        .order("start_date", { ascending: true }),
      supabase
        .from("transactions")
        .select("account_id, to_account_id, kind, amount, txn_date")
        .is("deleted_at", null)
        .order("txn_date", { ascending: true }),
    ]);

  const startingTotal = (accounts ?? []).reduce(
    (sum, a) => sum + a.starting_balance,
    0,
  );
  const sorted = (transactions ?? [])
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
      // Transfers move money between accounts we're already counting, so the
      // total net worth is unaffected — only income/expense change the sum.
      if (t.kind === "income") runningTotal += t.amount;
      else if (t.kind === "expense") runningTotal -= t.amount;
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
  const supabase = await createClient();
  const [{ data: accounts }, { data: transactions }] = await Promise.all([
    supabase.from("accounts").select("id, starting_balance"),
    supabase
      .from("transactions")
      .select("kind, amount, txn_date")
      .is("deleted_at", null)
      .order("txn_date", { ascending: true }),
  ]);

  const startingTotal = (accounts ?? []).reduce(
    (sum, a) => sum + a.starting_balance,
    0,
  );
  const sorted = (transactions ?? [])
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
    if (t.kind === "income") runningTotal += t.amount;
    else if (t.kind === "expense") runningTotal -= t.amount;
    txnIndex += 1;
  }

  const points: BalancePoint[] = [];
  for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    while (txnIndex < sorted.length && sorted[txnIndex].txn_date <= iso) {
      const t = sorted[txnIndex];
      if (t.kind === "income") runningTotal += t.amount;
      else if (t.kind === "expense") runningTotal -= t.amount;
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
  const summaries = await Promise.all(
    ordered.map((p) => getPeriodSummary(p.id)),
  );

  return ordered.map((p, i) => ({
    periodId: p.id,
    label: p.name.split(" ")[0]?.slice(0, 3) ?? p.name,
    income: summaries[i].income,
    expense: summaries[i].expense,
  }));
}
