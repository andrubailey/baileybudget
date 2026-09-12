import { getPeriods, pickPeriod } from "@/lib/periods";
import {
  getAccounts,
  getBudgetGrid,
  getCategories,
  getCategoryProgress,
  getPeriodSummary,
  getTransactions,
  getTransactionsForRange,
} from "@/lib/queries";
import type { Transaction } from "@/lib/types";
import { PageHeader } from "@/app/(app)/page-header";
import { SpendingTabs } from "../spending-tabs";
import { buildCategoryRows } from "../build-category-rows";
import { BudgetEditor } from "../breakdown/budget-editor";

// Setting planned amounts for the current month — its own tab now, split
// out from Breakdown (which just browses what already happened). Always
// the current period; unlike Breakdown there's no month strip here, since
// planning ahead or catching up a past month is rare enough not to earn a
// permanent switcher on this page.
export default async function SpendingBudgetPage() {
  const periods = await getPeriods();
  const period = pickPeriod(periods);

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

  const historyStart = new Date(`${period.start_date}T00:00:00Z`);
  historyStart.setUTCMonth(historyStart.getUTCMonth() - 5);
  const historyStartIso = historyStart.toISOString().slice(0, 10);

  const [previousTransactions, categoryProgress, summary, accounts, categories, historyTransactions] =
    await Promise.all([
      previous ? getTransactions(previous.id) : Promise.resolve([] as Transaction[]),
      getCategoryProgress(period.id),
      getPeriodSummary(period.id),
      getAccounts(),
      getCategories(),
      getTransactionsForRange(historyStartIso, period.end_date),
    ]);

  const debtIds = new Set(accounts.filter((a) => a.is_debt).map((a) => a.id));
  const rows = buildCategoryRows({
    period,
    categoryProgress,
    previousTransactions,
    historyTransactions,
    debtIds,
  });

  // The multi-month planning grid inside the editor: oldest to newest, the
  // 12 months up to the current one.
  const gridPeriods = periods.slice(index, index + 12).reverse();
  const gridRows = await getBudgetGrid(gridPeriods.map((p) => p.id));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Spending"
        description={`Set what you're planning to spend in ${period.name}.`}
      />
      <SpendingTabs />

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
    </div>
  );
}
