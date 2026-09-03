import { createClient } from "@/lib/supabase/server";
import type { Account, Category, Transaction } from "@/lib/types";

export type AccountWithBalance = Account & { balance: number };

export async function getAccountsWithBalances(): Promise<
  AccountWithBalance[]
> {
  const supabase = await createClient();

  const [{ data: accounts }, { data: transactions }] = await Promise.all([
    supabase.from("accounts").select("*").order("created_at"),
    supabase.from("transactions").select("account_id, kind, amount"),
  ]);

  const deltaByAccount = new Map<string, number>();
  for (const t of transactions ?? []) {
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
    .eq("period_id", periodId);

  let income = 0;
  let expense = 0;
  for (const t of data ?? []) {
    if (t.kind === "income") income += t.amount;
    else expense += t.amount;
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
  actual: number;
  remaining: number;
  overBudget: boolean;
};

export async function getCategoryProgress(
  periodId: string,
): Promise<CategoryProgress[]> {
  const supabase = await createClient();

  const [{ data: categories }, { data: transactions }] = await Promise.all([
    supabase
      .from("categories")
      .select("*")
      .eq("kind", "expense")
      .eq("period_id", periodId)
      .order("name"),
    supabase
      .from("transactions")
      .select("category_id, amount")
      .eq("period_id", periodId)
      .eq("kind", "expense"),
  ]);

  const actualByCategory = new Map<string, number>();
  for (const t of (transactions ?? []) as Pick<
    Transaction,
    "category_id" | "amount"
  >[]) {
    if (!t.category_id) continue;
    actualByCategory.set(
      t.category_id,
      (actualByCategory.get(t.category_id) ?? 0) + t.amount,
    );
  }

  return ((categories ?? []) as Category[]).map((c) => {
    const actual = actualByCategory.get(c.id) ?? 0;
    return {
      ...c,
      actual,
      remaining: c.planned_amount - actual,
      overBudget: actual > c.planned_amount && c.planned_amount > 0,
    };
  });
}

// Expense categories scoped to one period, plus the shared income categories.
export async function getCategoriesForPeriod(
  periodId: string,
): Promise<Category[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("categories")
    .select("*")
    .or(`period_id.eq.${periodId},kind.eq.income`)
    .order("kind")
    .order("name");
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
    .order("txn_date", { ascending: false })
    .order("created_at", { ascending: false });
  return data ?? [];
}
