import Link from "next/link";
import { getPeriods } from "@/lib/periods";
import { getBudgetGrid } from "@/lib/queries";
import { BudgetGrid } from "./budget-grid";

export default async function BudgetsPage() {
  const periods = await getPeriods();
  // Oldest to newest, most recent 12 months, for a left-to-right timeline.
  const orderedPeriods = periods.slice(0, 12).slice().reverse();
  const rows = await getBudgetGrid(orderedPeriods.map((p) => p.id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text">Budgets</h1>
        <p className="mt-1 text-sm text-text-muted">
          Set planned amounts across multiple months at once. Click a cell, type an amount, then click away to save.
        </p>
      </div>

      {/* A categories × months matrix has no lightweight mobile shape — it's
          a spreadsheet by nature. Point to the one-month editor instead of
          forcing a wide, horizontally-scrolling grid onto a phone screen. */}
      <div className="rounded-xl border border-dashed border-border p-6 text-center sm:hidden">
        <p className="text-sm text-text-muted">
          The budgets grid needs a wider screen to be usable.
        </p>
        <Link href="/transactions?view=categories" className="mt-2 inline-block text-sm font-medium text-accent underline underline-offset-2">
          Edit this month&apos;s planned amounts instead
        </Link>
      </div>

      <div className="hidden sm:block">
        <BudgetGrid rows={rows} periods={orderedPeriods} />
      </div>
    </div>
  );
}
