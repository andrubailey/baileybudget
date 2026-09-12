import type { Transaction } from "@/lib/types";
import type { CategoryProgress } from "@/lib/queries";

// Shared by the Breakdown and Budget pages — both need the same "one row
// per expense category, six months of history attached" shape, just
// rendered differently (a browsable table vs. an editable planned-amount
// list). Kept as one function so the history/last-month math (and the
// debt-account income/expense inversion it depends on) only lives in one
// place instead of drifting between the two pages.
export type CategoryRow = {
  id: string;
  name: string;
  icon: string | null;
  group: string | null;
  isActive: boolean;
  // "Need" is purely descriptive here (no needs/wants rollup reads it yet)
  // — it's just tagged per category so that reporting can be built later
  // without a second pass to backfill every category's answer.
  isNeed: boolean;
  // When true, an unspent (or overspent) amount carries into next period's
  // planned amount instead of resetting — see lib/queries.ts's
  // getRolloverAmounts, which already folds this into `planned` above
  // whenever it's on.
  rollover: boolean;
  planned: number;
  actual: number;
  lastMonth: number;
  monthlyAverage: number;
  history: { month: string; amount: number }[];
  transactions: { id: string; description: string; amount: number; txn_date: string }[];
};

// On a debt account (credit card, loan) a charge is stored as "income" and a
// payment as "expense" — spend is "expense on a normal account, or income
// on a debt account," and a debt payment isn't new spending at all.
export function isSpendTransaction(
  t: Pick<Transaction, "kind" | "account_id">,
  debtIds: Set<string>,
): boolean {
  return (
    t.kind !== "transfer" &&
    (t.account_id && debtIds.has(t.account_id) ? t.kind === "income" : t.kind === "expense")
  );
}

export function isIncomeTransaction(
  t: Pick<Transaction, "kind" | "account_id">,
  debtIds: Set<string>,
): boolean {
  return (
    t.kind !== "transfer" &&
    !(t.account_id && debtIds.has(t.account_id)) &&
    t.kind === "income"
  );
}

export function buildCategoryRows({
  period,
  categoryProgress,
  previousTransactions,
  historyTransactions,
  debtIds,
}: {
  period: { start_date: string };
  categoryProgress: CategoryProgress[];
  previousTransactions: Transaction[];
  historyTransactions: Transaction[];
  debtIds: Set<string>;
}): CategoryRow[] {
  // Six month keys, oldest first, ending on the selected month.
  const monthKeys: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(`${period.start_date}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - i);
    monthKeys.push(d.toISOString().slice(0, 7));
  }

  const historyByCategory = new Map<string, Map<string, number>>();
  for (const t of historyTransactions) {
    if (!isSpendTransaction(t, debtIds) || !t.category_id) continue;
    const m = t.txn_date.slice(0, 7);
    const byMonth = historyByCategory.get(t.category_id) ?? new Map<string, number>();
    byMonth.set(m, (byMonth.get(m) ?? 0) + t.amount);
    historyByCategory.set(t.category_id, byMonth);
  }
  const lastMonthByCategory = new Map<string, number>();
  for (const t of previousTransactions) {
    if (!isSpendTransaction(t, debtIds) || !t.category_id) continue;
    lastMonthByCategory.set(t.category_id, (lastMonthByCategory.get(t.category_id) ?? 0) + t.amount);
  }

  return categoryProgress.map((c) => {
    const byMonth = historyByCategory.get(c.id) ?? new Map<string, number>();
    const history = monthKeys.map((m) => ({ month: m, amount: byMonth.get(m) ?? 0 }));
    const monthsWithData = history.filter((h) => h.amount > 0).length;
    return {
      id: c.id,
      name: c.name,
      icon: c.icon,
      group: c.group_name,
      isActive: c.is_active !== false,
      isNeed: c.is_need,
      rollover: c.rollover,
      planned: c.planned,
      actual: c.actual,
      lastMonth: lastMonthByCategory.get(c.id) ?? 0,
      monthlyAverage:
        monthsWithData > 0 ? history.reduce((s, h) => s + h.amount, 0) / monthsWithData : 0,
      history,
      transactions: c.transactions,
    };
  });
}
