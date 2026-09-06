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

type SplitRow = { transaction_id: string; category_id: string | null; amount: number };

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
    actualByCategory.set(s.category_id, (actualByCategory.get(s.category_id) ?? 0) + s.amount);
  }
}

export type AccountWithBalance = Account & { balance: number };

export async function getAccountsWithBalances(): Promise<
  AccountWithBalance[]
> {
  const supabase = await createClient();

  const [
    { data: accounts, error: accountsError },
    { data: transactions, error: transactionsError },
  ] = await Promise.all([
    supabase.from("accounts").select("*").order("sort_order").order("created_at"),
    supabase
      .from("transactions")
      .select("account_id, to_account_id, kind, amount")
      .is("deleted_at", null),
  ]);

  // A query error here (e.g. a pending migration) must not silently fall back
  // to starting_balance only — that looks exactly like lost account history.
  if (accountsError) throw accountsError;
  if (transactionsError) throw transactionsError;

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

  const [{ data: period }, { data: categories }, { data: budgetLines }, { data: transactions }] =
    await Promise.all([
      supabase.from("periods").select("*").eq("id", periodId).single(),
      supabase
        .from("categories")
        .select("*")
        .eq("kind", "expense")
        .order("name"),
      supabase
        .from("budget_lines")
        .select("*")
        .eq("period_id", periodId),
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

  const rolloverCategories = ((categories ?? []) as Category[]).filter((c) => c.rollover);
  const rolloverByCategory = await getRolloverAmounts(period, rolloverCategories);

  return ((categories ?? []) as Category[]).map((c) => {
    const planned = (plannedByCategory.get(c.id) ?? 0) + (rolloverByCategory.get(c.id) ?? 0);
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
  const [{ data: prevBudgetLines }, { data: prevTransactions }] = await Promise.all([
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
    prevActual.set(t.category_id, (prevActual.get(t.category_id) ?? 0) + t.amount);
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

  const [{ data: categories }, { data: overlappingPeriods }, { data: transactions }] =
    await Promise.all([
      supabase
        .from("categories")
        .select("*")
        .eq("kind", "expense")
        .order("name"),
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
): Promise<Pick<Transaction, "id" | "description" | "amount" | "txn_date" | "created_by_email">[]> {
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

export async function getRecurringTransactions(): Promise<RecurringTransaction[]> {
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
export async function getPostedRecurringIds(periodId: string): Promise<Set<string>> {
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

export type NetWorthPoint = { periodId: string; periodName: string; endDate: string; netWorth: number };

// Cumulative balance across all accounts as of the end of each period,
// oldest first, for a balance-over-time chart.
export async function getNetWorthHistory(): Promise<NetWorthPoint[]> {
  const supabase = await createClient();
  const [{ data: accounts }, { data: periods }, { data: transactions }] = await Promise.all([
    supabase.from("accounts").select("id, starting_balance"),
    supabase.from("periods").select("*").order("start_date", { ascending: true }),
    supabase
      .from("transactions")
      .select("account_id, to_account_id, kind, amount, txn_date")
      .is("deleted_at", null)
      .order("txn_date", { ascending: true }),
  ]);

  const startingTotal = (accounts ?? []).reduce((sum, a) => sum + a.starting_balance, 0);
  const sorted = (transactions ?? []).slice().sort((a, b) => a.txn_date.localeCompare(b.txn_date));

  let runningTotal = startingTotal;
  let txnIndex = 0;
  const points: NetWorthPoint[] = [];

  for (const period of (periods ?? []) as { id: string; name: string; end_date: string }[]) {
    while (txnIndex < sorted.length && sorted[txnIndex].txn_date <= period.end_date) {
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

export type BudgetGridRow = {
  category: Category;
  plannedByPeriod: Map<string, number>;
};

// Categories x periods matrix of planned amounts for multi-month planning.
export async function getBudgetGrid(periodIds: string[]): Promise<BudgetGridRow[]> {
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

  const remainingBudget = categoryProgress.reduce((sum, c) => sum + Math.max(0, c.remaining), 0);
  if (!period) return remainingBudget;

  const today = new Date().toISOString().slice(0, 10);
  const isCurrentPeriod = period.start_date <= today && period.end_date >= today;
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

