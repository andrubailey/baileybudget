import { createClient } from "@/lib/supabase/server";
import type { Account, BudgetLine, Category, Objective, Transaction } from "@/lib/types";

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

  const [{ data: categories }, { data: budgetLines }, { data: transactions }] =
    await Promise.all([
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
  for (const t of (transactions ?? []) as Pick<
    Transaction,
    "id" | "category_id" | "amount" | "description" | "txn_date"
  >[]) {
    if (!t.category_id) continue;
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
  for (const t of (transactions ?? []) as Pick<
    Transaction,
    "id" | "category_id" | "amount" | "description" | "txn_date"
  >[]) {
    if (!t.category_id) continue;
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

