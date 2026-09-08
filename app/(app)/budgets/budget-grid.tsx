"use client";

import { Fragment, useState, useTransition } from "react";
import { upsertBudgetLine } from "@/app/actions";
import { getCategoryIcon } from "@/lib/category-icons";
import { formatMoney } from "@/lib/format";
import type { Period } from "@/lib/types";
import type { BudgetGridRow } from "@/lib/queries";
import { EmptyState } from "@/app/(app)/empty-state";

export function BudgetGrid({
  rows,
  periods,
}: {
  rows: BudgetGridRow[];
  periods: Period[];
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-card">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-border bg-bg">
            <th className="sticky left-0 z-10 bg-bg px-6 py-2 text-xs font-medium text-text-muted">
              Category
            </th>
            {periods.map((p) => (
              <th
                key={p.id}
                className="px-4 py-2 text-xs font-medium whitespace-nowrap text-text-muted"
              >
                {p.name}
              </th>
            ))}
            <th className="px-4 py-2 text-xs font-medium whitespace-nowrap text-text-muted">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {[...rows]
            .sort(
              (a, b) =>
                (a.category.group_name ?? "").localeCompare(
                  b.category.group_name ?? "",
                ) || a.category.name.localeCompare(b.category.name),
            )
            .map((row, i, sorted) => {
              const total = periods.reduce(
                (sum, p) => sum + (row.plannedByPeriod.get(p.id) ?? 0),
                0,
              );
              const showGroupHeader =
                row.category.group_name &&
                sorted[i - 1]?.category.group_name !== row.category.group_name;
              return (
                <Fragment key={row.category.id}>
                  {showGroupHeader && (
                    <tr>
                      <td
                        colSpan={periods.length + 2}
                        className="sticky left-0 z-10 bg-bg px-6 py-1.5 text-xs font-semibold uppercase tracking-wide text-text-faint"
                      >
                        {row.category.group_name}
                      </td>
                    </tr>
                  )}
                  <tr className="border-b border-border last:border-b-0">
                    <td className="sticky left-0 z-10 bg-surface px-6 py-2">
                      <div className="flex items-center gap-2 whitespace-nowrap text-sm font-medium text-text">
                        <span>{getCategoryIcon(row.category.name)}</span>
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
                    <td className="tabular px-4 py-2 text-sm font-medium text-text-muted">
                      {formatMoney(total)}
                    </td>
                  </tr>
                </Fragment>
              );
            })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={periods.length + 2} className="px-6 py-4">
                <EmptyState message="No expense categories yet." />
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function GridCell({
  categoryId,
  periodId,
  initialValue,
}: {
  categoryId: string;
  periodId: string;
  initialValue: number;
}) {
  const [value, setValue] = useState(initialValue ? String(initialValue) : "");
  const [, startTransition] = useTransition();

  function save() {
    const amount = Number(value || 0);
    startTransition(() => {
      upsertBudgetLine(categoryId, periodId, amount);
    });
  }

  return (
    <td className="px-4 py-2">
      <input
        type="number"
        step="0.01"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        className="tabular w-24 rounded-md border border-border bg-bg px-2 py-1 text-sm text-text outline-none focus:border-accent"
      />
    </td>
  );
}
