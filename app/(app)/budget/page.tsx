import { getPeriods, pickPeriod } from "@/lib/periods";
import { getCategoryProgressForRange } from "@/lib/queries";
import { Money } from "@/app/(app)/money";
import { SegmentedProgress } from "@/app/(app)/segmented-progress";
import { EmptyState } from "@/app/(app)/empty-state";
import { BudgetCategoryRow } from "./budget-category-row";

// The mobile Budget tab: one headline (what's left this month, against the
// month's total plan) and an overall progress bar up top, then every
// budgeted category ranked by how close it is to (or past) its limit.
// Always the current month — no month switcher or Expenses/Income tabs;
// this is meant to be a fast, single glance at where the month stands.
export default async function BudgetSummaryPage() {
  const periods = await getPeriods();
  const period = pickPeriod(periods);

  if (!period) {
    return (
      <p className="text-sm text-text-muted">
        Couldn&apos;t set up this month&apos;s period automatically — try reloading the
        page.
      </p>
    );
  }

  const categoryProgress = await getCategoryProgressForRange(period.start_date, period.end_date);

  const budgeted = categoryProgress.filter((c) => c.planned !== 0 || c.actual !== 0);
  const totalPlanned = budgeted.reduce((sum, c) => sum + c.planned, 0);
  const totalActual = budgeted.reduce((sum, c) => sum + c.actual, 0);
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

  const budgetRows = [...budgeted].sort((a, b) => budgetRatio(b) - budgetRatio(a));

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

      <div className="card">
        {budgetRows.length === 0 ? (
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
        )}
      </div>
    </div>
  );
}
