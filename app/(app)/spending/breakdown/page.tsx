import { getPeriods, pickPeriod } from "@/lib/periods";
import {
  getAccounts,
  getBudgetGrid,
  getCategories,
  getCategoryProgress,
  getMonthlyFlow,
  getPeriodSummary,
  getTransactions,
  getTransactionsForRange,
} from "@/lib/queries";
import type { Transaction } from "@/lib/types";
import { PageHeader } from "@/app/(app)/page-header";
import { SpendingTabs } from "../spending-tabs";
import { PeriodStrip } from "./period-strip";
import { BreakdownPanel, type CategoryRow } from "./breakdown-panel";
import { CashFlowCard, LargestTransactionsCard, MostFrequentCard } from "./side-cards";
import { BudgetEditor } from "./budget-editor";

// The "Breakdown & budget" view of Spending: a month strip up top, then the
// category breakdown (expenses / budget / income) with its table, and a
// rail of cash flow, largest transactions and most frequent merchants.
// `?edit=1` swaps the breakdown for the monthly budget editor.
export default async function SpendingBreakdownPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; edit?: string }>;
}) {
  const { period: requestedPeriod, edit } = await searchParams;
  const periods = await getPeriods();
  const period = pickPeriod(periods, requestedPeriod);

  if (!period) {
    return (
      <div className="space-y-6">
        <PageHeader title="Spending" />
        <SpendingTabs />
        <p className="text-sm text-text-muted">
          Couldn&apos;t set up this month&apos;s period automatically. Try reloading the page.
        </p>
      </div>
    );
  }

  const index = periods.findIndex((p) => p.id === period.id);
  const previous = periods[index + 1] ?? null;

  // Six months back from the selected month, for per-category history in
  // the detail drawer and the "monthly average" figure.
  const historyStart = new Date(`${period.start_date}T00:00:00Z`);
  historyStart.setUTCMonth(historyStart.getUTCMonth() - 5);
  const historyStartIso = historyStart.toISOString().slice(0, 10);

  const [transactions, previousTransactions, categoryProgress, summary, flow, accounts, categories, historyTransactions] =
    await Promise.all([
      getTransactions(period.id),
      previous ? getTransactions(previous.id) : Promise.resolve([] as Transaction[]),
      getCategoryProgress(period.id),
      getPeriodSummary(period.id),
      getMonthlyFlow(24),
      getAccounts(),
      getCategories(),
      getTransactionsForRange(historyStartIso, period.end_date),
    ]);

  const debtIds = new Set(accounts.filter((a) => a.is_debt).map((a) => a.id));
  const isSpend = (t: Transaction) =>
    t.kind !== "transfer" &&
    (t.account_id && debtIds.has(t.account_id) ? t.kind === "income" : t.kind === "expense");
  const isIncome = (t: Transaction) =>
    t.kind !== "transfer" &&
    !(t.account_id && debtIds.has(t.account_id)) &&
    t.kind === "income";

  // Six month keys, oldest first, ending on the selected month.
  const monthKeys: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(`${period.start_date}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - i);
    monthKeys.push(d.toISOString().slice(0, 7));
  }
  const historyByCategory = new Map<string, Map<string, number>>();
  for (const t of historyTransactions) {
    if (!isSpend(t) || !t.category_id) continue;
    const m = t.txn_date.slice(0, 7);
    const byMonth = historyByCategory.get(t.category_id) ?? new Map<string, number>();
    byMonth.set(m, (byMonth.get(m) ?? 0) + t.amount);
    historyByCategory.set(t.category_id, byMonth);
  }
  const lastMonthByCategory = new Map<string, number>();
  for (const t of previousTransactions) {
    if (!isSpend(t) || !t.category_id) continue;
    lastMonthByCategory.set(t.category_id, (lastMonthByCategory.get(t.category_id) ?? 0) + t.amount);
  }

  const rows: CategoryRow[] = categoryProgress.map((c) => {
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

  // Income categories with this month's totals (for the Income tab).
  const incomeByCategory = new Map<string, number>();
  let uncategorizedIncome = 0;
  for (const t of transactions) {
    if (!isIncome(t)) continue;
    if (t.category_id) incomeByCategory.set(t.category_id, (incomeByCategory.get(t.category_id) ?? 0) + t.amount);
    else uncategorizedIncome += t.amount;
  }
  const incomeRows = categories
    .filter((c) => c.kind === "income")
    .map((c) => ({ id: c.id, name: c.name, icon: c.icon, actual: incomeByCategory.get(c.id) ?? 0 }))
    .filter((c) => c.actual > 0)
    .sort((a, b) => b.actual - a.actual);
  if (uncategorizedIncome > 0) {
    incomeRows.push({ id: "uncategorized", name: "Uncategorized", icon: "income", actual: uncategorizedIncome });
  }

  const spendTransactions = transactions.filter(isSpend);
  const largest = [...spendTransactions].sort((a, b) => b.amount - a.amount).slice(0, 5);
  const frequency = new Map<string, { count: number; total: number }>();
  for (const t of spendTransactions) {
    const key = t.description.trim().toLowerCase();
    const entry = frequency.get(key) ?? { count: 0, total: 0 };
    entry.count += 1;
    entry.total += t.amount;
    frequency.set(key, entry);
  }
  const mostFrequent = [...frequency.entries()]
    .map(([key, v]) => ({
      name: spendTransactions.find((t) => t.description.trim().toLowerCase() === key)?.description ?? key,
      ...v,
    }))
    .sort((a, b) => b.count - a.count || b.total - a.total)
    .slice(0, 4);

  const strip = flow.map((f) => ({ periodId: f.periodId, label: f.label, expense: f.expense, income: f.income }));
  const stripWithNames = strip.map((s) => {
    const p = periods.find((x) => x.id === s.periodId);
    return { ...s, name: p?.name ?? s.label, startDate: p?.start_date ?? "" };
  });

  const editing = edit === "1";
  // The multi-month planning grid is only shown inside the editor, so only
  // pay for it there. Oldest to newest, the 12 months up to the selected one.
  const gridPeriods = editing ? periods.slice(index, index + 12).reverse() : [];
  const gridRows = editing ? await getBudgetGrid(gridPeriods.map((p) => p.id)) : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Spending"
        description={`Where ${period.name} went, category by category, against the budget you set for it.`}
      />
      <SpendingTabs />

      <PeriodStrip months={stripWithNames} selectedId={period.id} />

      {editing ? (
        <BudgetEditor
          periodId={period.id}
          periodName={period.name}
          previousPeriod={previous ? { id: previous.id, name: previous.name } : null}
          income={summary.income}
          rows={rows}
          categories={categories}
          gridRows={gridRows}
          gridPeriods={gridPeriods.filter((p) => p.id !== period.id)}
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
          <BreakdownPanel
            periodId={period.id}
            periodName={period.name}
            rows={rows}
            incomeRows={incomeRows}
            totalIncome={summary.income}
            accounts={accounts}
            categories={categories}
          />
          <div className="space-y-6">
            <CashFlowCard income={summary.income} expenses={summary.expense} />
            <LargestTransactionsCard transactions={largest} />
            <MostFrequentCard items={mostFrequent} />
          </div>
        </div>
      )}
    </div>
  );
}
