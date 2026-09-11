import Link from "next/link";
import { getPeriods, pickPeriod } from "@/lib/periods";
import { getCategoryProgressForRange, getIncomeCategoryProgressForRange } from "@/lib/queries";
import { Money } from "@/app/(app)/money";
import { SegmentedProgress } from "@/app/(app)/segmented-progress";
import { EmptyState } from "@/app/(app)/empty-state";
import { MonthPills } from "./month-pills";
import { BudgetCategoryRow } from "./budget-category-row";

const TABS = [
  { key: "expenses", label: "Expenses" },
  { key: "budget", label: "Budget" },
  { key: "income", label: "Income" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

// The mobile Budget tab: one headline (what's left this month, against the
// month's total plan) and an overall progress bar up top — true regardless
// of which category tab is selected below — then Expenses/Budget/Income
// switch which category list renders. Month switching lives in pills across
// the top rather than a menu, since flipping back a month or two to check
// something is common enough to deserve a single tap.
export default async function BudgetSummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; tab?: string }>;
}) {
  const { period: requestedPeriod, tab: requestedTab } = await searchParams;
  const tab: TabKey = TABS.find((t) => t.key === requestedTab)?.key ?? "expenses";

  const periods = await getPeriods();
  const period = pickPeriod(periods, requestedPeriod);

  if (!period) {
    return (
      <p className="text-sm text-text-muted">
        Couldn&apos;t set up this month&apos;s period automatically — try reloading the
        page.
      </p>
    );
  }

  const [categoryProgress, incomeCategories] = await Promise.all([
    getCategoryProgressForRange(period.start_date, period.end_date),
    getIncomeCategoryProgressForRange(period.start_date, period.end_date),
  ]);

  const budgeted = categoryProgress.filter((c) => c.planned !== 0 || c.actual !== 0);
  const totalPlanned = budgeted.reduce((sum, c) => sum + c.planned, 0);
  const totalActual = budgeted.reduce((sum, c) => sum + c.actual, 0);
  const totalIncome = incomeCategories.reduce((sum, c) => sum + c.actual, 0);
  const overallPct = totalPlanned > 0 ? (totalActual / totalPlanned) * 100 : 0;
  const remaining = totalPlanned - totalActual;
  const overBudget = totalPlanned > 0 && totalActual > totalPlanned;

  // Ratio of actual to planned, closest-to-or-past-limit first — spend with
  // no plan behind it at all ranks above everything, same as the desktop
  // Budget tab's ordering.
  function budgetRatio(c: (typeof budgeted)[number]) {
    if (c.planned > 0) return c.actual / c.planned;
    return c.actual > 0 ? Number.MAX_SAFE_INTEGER : 0;
  }

  const expenseRows = [...budgeted].sort((a, b) => b.actual - a.actual);
  const budgetRows = [...budgeted].sort((a, b) => budgetRatio(b) - budgetRatio(a));
  const incomeRows = [...incomeCategories].filter((c) => c.actual > 0).sort((a, b) => b.actual - a.actual);

  return (
    <div className="mx-auto max-w-md space-y-5">
      <div className="card">
        <p className="text-xs font-medium text-text-muted">
          {totalPlanned > 0 ? "Left to spend" : "Spent"} · {period.name}
        </p>
        <Money
          amount={totalPlanned > 0 ? remaining : totalActual}
          variant="balance"
          signDisplay={totalPlanned > 0 ? "auto" : "none"}
          tone={overBudget ? "negative" : "neutral"}
          className="text-balance-display mt-1 block"
        />
        {totalPlanned > 0 && (
          <>
            <SegmentedProgress pct={overallPct} overBudget={overBudget} className="mt-3" />
            <p className="tabular mt-1.5 text-xs text-text-faint">
              <Money amount={totalActual} className="text-text-muted" /> of{" "}
              <Money amount={totalPlanned} className="text-text-muted" /> planned
            </p>
          </>
        )}
      </div>

      <MonthPills periods={periods} activeId={period.id} tab={tab} />

      <div role="tablist" className="grid grid-cols-3 rounded-xl bg-bg p-1">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/budget?period=${period.id}&tab=${t.key}`}
            scroll={false}
            role="tab"
            aria-selected={tab === t.key}
            className={`rounded-lg py-1.5 text-center text-sm font-medium transition-colors ${
              tab === t.key ? "bg-surface text-text shadow-card" : "text-text-muted"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <div className="card">
        {tab === "expenses" &&
          (expenseRows.length === 0 ? (
            <EmptyState compact message="Nothing logged this month yet." />
          ) : (
            <div className="divide-y divide-border">
              {expenseRows.map((c, i) => (
                <BudgetCategoryRow
                  key={c.id}
                  id={c.id}
                  name={c.name}
                  icon={c.icon}
                  actual={c.actual}
                  of={totalActual}
                  overBudget={c.overBudget}
                  index={i}
                  detail={c}
                  editablePeriodId={period.id}
                />
              ))}
            </div>
          ))}

        {tab === "budget" &&
          (budgetRows.length === 0 ? (
            <EmptyState compact message="No budget set for this month." />
          ) : (
            <div className="divide-y divide-border">
              {budgetRows.map((c, i) => (
                <BudgetCategoryRow
                  key={c.id}
                  id={c.id}
                  name={c.name}
                  icon={c.icon}
                  actual={c.actual}
                  of={c.planned}
                  overBudget={c.overBudget}
                  index={i}
                  detail={c}
                  editablePeriodId={period.id}
                />
              ))}
            </div>
          ))}

        {tab === "income" &&
          (incomeRows.length === 0 ? (
            <EmptyState compact message="Nothing logged this month yet." />
          ) : (
            <div className="divide-y divide-border">
              {incomeRows.map((c, i) => (
                <BudgetCategoryRow
                  key={c.id}
                  id={c.id}
                  name={c.name}
                  icon={c.icon}
                  actual={c.actual}
                  of={totalIncome}
                  index={i}
                />
              ))}
            </div>
          ))}
      </div>
    </div>
  );
}
