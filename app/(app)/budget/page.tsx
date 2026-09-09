import { getPeriods, pickPeriod } from "@/lib/periods";
import { getCategoryProgressForRange } from "@/lib/queries";
import { BudgetCategoriesCard } from "@/app/(app)/budget-categories";

// The mobile Budget tab — the same "this month's category spending" card
// the dashboard shows, standing alone as its own page instead of sharing
// space with everything else the desktop Overview has room for. The full
// budget-management page (add/deactivate categories, past months, copy
// forward) stays desktop-only at /budgets.
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

  const categoryProgress = await getCategoryProgressForRange(
    period.start_date,
    period.end_date,
  );

  return (
    <div className="mx-auto max-w-md">
      <BudgetCategoriesCard
        categoryProgress={categoryProgress}
        editablePeriodId={period.id}
        rangeIsSinglePeriod
      />
    </div>
  );
}
