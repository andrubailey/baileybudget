import { createClient } from "@/lib/supabase/server";
import type { Account, BudgetLine, Category, Transaction } from "@/lib/types";

export type AccountWithBalance = Account & { balance: number };

// Group accounts by bank in a fixed order — Chase (business accounts before
// personal), then CIT Bank, then Amex — with anything else last.
const BANK_ORDER = ["Chase", "CIT Bank", "Amex"];

function accountSortKey(a: Account): [number, number, string] {
  const bankRank = a.bank ? BANK_ORDER.indexOf(a.bank) : -1;
  const businessRank = /business/i.test(a.name) ? 0 : 1;
  return [bankRank === -1 ? BANK_ORDER.length : bankRank, businessRank, a.name];
}

function sortAccounts<T extends Account>(accounts: T[]): T[] {
  return [...accounts].sort((a, b) => {
    const [aBank, aBusiness, aName] = accountSortKey(a);
    const [bBank, bBusiness, bName] = accountSortKey(b);
    return aBank - bBank || aBusiness - bBusiness || aName.localeCompare(bName);
  });
}

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

  const withBalances = (accounts ?? []).map((a) => ({
    ...a,
    balance: a.starting_balance + (deltaByAccount.get(a.id) ?? 0),
  }));

  return sortAccounts(withBalances);
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
        .select("category_id, amount")
        .eq("period_id", periodId)
        .eq("kind", "expense"),
    ]);

  const plannedByCategory = new Map<string, number>();
  for (const line of (budgetLines ?? []) as BudgetLine[]) {
    plannedByCategory.set(line.category_id, line.planned_amount);
  }

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
    const planned = plannedByCategory.get(c.id) ?? 0;
    const actual = actualByCategory.get(c.id) ?? 0;
    return {
      ...c,
      planned,
      actual,
      remaining: planned - actual,
      overBudget: actual > planned && planned > 0,
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
