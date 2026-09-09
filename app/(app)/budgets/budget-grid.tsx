"use client";

import { Fragment } from "react";
import { getCategoryIcon } from "@/lib/category-icons";
import type { Period } from "@/lib/types";
import type { BudgetGridRow } from "@/lib/queries";
import { GridCell } from "./grid-cell";

// Full categories × months matrix — a lot to take in at once, so this only
// renders inside the Budgets page's collapsed-by-default "past months"
// section rather than being the page's default view.
export function BudgetGrid({
  rows,
  periods,
}: {
  rows: BudgetGridRow[];
  periods: Period[];
}) {
  const sorted = [...rows].sort(
    (a, b) =>
      (a.category.group_name ?? "").localeCompare(
        b.category.group_name ?? "",
      ) || a.category.name.localeCompare(b.category.name),
  );

  return (
    <div className="animate-fade-in-up overflow-x-auto rounded-xl border border-border bg-surface shadow-card">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-border bg-bg">
            <th className="sticky top-0 left-0 z-20 bg-bg px-6 py-2 text-xs font-medium text-text-muted">
              Category
            </th>
            {periods.map((p) => (
              <th
                key={p.id}
                className="sticky top-0 z-10 bg-bg px-4 py-2 text-xs font-medium whitespace-nowrap text-text-muted"
              >
                {p.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => {
            const showGroupHeader =
              row.category.group_name &&
              sorted[i - 1]?.category.group_name !== row.category.group_name;
            return (
              <Fragment key={row.category.id}>
                {showGroupHeader && (
                  <tr>
                    <td
                      colSpan={periods.length + 1}
                      className="sticky left-0 z-10 bg-bg px-6 py-1.5 text-xs font-semibold uppercase tracking-wide text-text-faint"
                    >
                      {row.category.group_name}
                    </td>
                  </tr>
                )}
                <tr className="group border-b border-border transition-colors last:border-b-0 hover:bg-bg">
                  <td className="sticky left-0 z-10 bg-surface px-6 py-2 transition-colors group-hover:bg-bg">
                    <div className="flex items-center gap-2 whitespace-nowrap text-sm font-medium text-text">
                      <span>{getCategoryIcon(row.category.name, row.category.icon)}</span>
                      {row.category.name}
                    </div>
                  </td>
                  {periods.map((p) => (
                    <GridCell
                      key={p.id}
                      categoryId={row.category.id}
                      periodId={p.id}
                      initialValue={row.plannedByPeriod.get(p.id) ?? 0}
                    />
                  ))}
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
