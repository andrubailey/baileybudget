import { getPeriods, pickPeriod } from "@/lib/periods";
import { PageHeader } from "@/app/(app)/page-header";
import { getBudgetGrid } from "@/lib/queries";
import { BudgetsView } from "./budgets-view";

export default async function BudgetsPage() {
  const periods = await getPeriods();
  const currentPeriod = pickPeriod(periods);
  // Oldest to newest, most recent 12 months — only used if "past months" is
  // expanded; the current month is what's actually in front view.
  const orderedPeriods = periods.slice(0, 12).slice().reverse();
  const rows = await getBudgetGrid(orderedPeriods.map((p) => p.id));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Budget"
        description={
          currentPeriod
            ? `Planned amounts for ${currentPeriod.name}. Click a number to edit it.`
            : "Set planned amounts for each category."
        }
      />

      <BudgetsView rows={rows} periods={orderedPeriods} currentPeriod={currentPeriod} />
    </div>
  );
}
