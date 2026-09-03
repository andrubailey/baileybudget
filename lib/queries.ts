import { createClient } from "@/lib/supabase/server";
import type { Account, BudgetLine, Category, Transaction } from "@/lib/types";

export type AccountWithBalance = Account & { balance: number };

export async function getAccountsWithBalances(): Promise<
  AccountWithBalance[]
> {
  const supabase = await createClient();

  const [{ data: accounts }, { data: transactions }] = await Promise.all([
    supabase.from("accounts").select("*").order("sort_order").order("created_at"),
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
  planned: number;
  actual: number;
  remaining: number;
  overBudget: boolean;
  transactions: { id: string; description: string }[];
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
        .select("id, category_id, amount, description")
        .eq("period_id", periodId)
        .eq("kind", "expense")
        .order("txn_date", { ascending: false }),
    ]);

  const plannedByCategory = new Map<string, number>();
  for (const line of (budgetLines ?? []) as BudgetLine[]) {
    plannedByCategory.set(line.category_id, line.planned_amount);
  }

  const actualByCategory = new Map<string, number>();
  const transactionsByCategory = new Map<
    string,
    { id: string; description: string }[]
  >();
  for (const t of (transactions ?? []) as Pick<
    Transaction,
    "id" | "category_id" | "amount" | "description"
  >[]) {
    if (!t.category_id) continue;
    actualByCategory.set(
      t.category_id,
      (actualByCategory.get(t.category_id) ?? 0) + t.amount,
    );
    const list = transactionsByCategory.get(t.category_id) ?? [];
    list.push({ id: t.id, description: t.description });
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

export async function getCategories(): Promise<Category[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("categories")
    .select("*")
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
