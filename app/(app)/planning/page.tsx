import { getPeriods } from "@/lib/periods";
import { getBudgetGrid } from "@/lib/queries";
import { BudgetGrid } from "./budget-grid";

export default async function PlanningPage() {
  const periods = await getPeriods();
  // Oldest to newest, most recent 12 months, for a left-to-right timeline.
  const orderedPeriods = periods.slice(0, 12).slice().reverse();
  const rows = await getBudgetGrid(orderedPeriods.map((p) => p.id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text">Budget Planning</h1>
        <p className="mt-1 text-sm text-text-muted">
          Set planned amounts across multiple months at once. Click a cell, type an amount, then click away to save.
        </p>
      </div>

      <BudgetGrid rows={rows} periods={orderedPeriods} />
    </div>
  );
}
