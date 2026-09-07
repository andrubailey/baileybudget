"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { upsertBudgetLine } from "@/app/actions";
import { formatMoney } from "@/lib/format";
import { getCategoryIcon } from "@/lib/category-icons";
import { getCategoryColor } from "@/lib/category-colors";
import { StatusPill } from "@/app/(app)/status-pill";
import { EmptyState } from "@/app/(app)/empty-state";
import type { CategoryProgress } from "@/lib/queries";

export function BudgetCategoriesCard({
  categoryProgress,
  editablePeriodId,
  rangeIsSinglePeriod,
}: {
  categoryProgress: CategoryProgress[];
  editablePeriodId: string | null;
  rangeIsSinglePeriod: boolean;
}) {
  const sorted = [...categoryProgress].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="min-w-0">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-heading text-text">Budget categories</h2>
        {!rangeIsSinglePeriod && categoryProgress.length > 0 && (
          <span className="text-xs text-text-faint">
            Switch to a single month to edit planned amounts
          </span>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-card">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border bg-bg">
              <th className="px-6 py-2 text-xs font-medium text-text-muted">Name</th>
              <th className="px-6 py-2 text-xs font-medium text-text-muted">Planned</th>
              <th className="px-6 py-2 text-xs font-medium text-text-muted">Actual</th>
              <th className="px-6 py-2 text-xs font-medium text-text-muted">Progress</th>
              <th className="px-6 py-2" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((c) => (
              <CategoryRow key={c.id} category={c} editablePeriodId={editablePeriodId} />
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-4">
                  <EmptyState
                    message="No expense categories yet."
                    action={
                      <Link href="/categories" className="text-xs text-accent underline underline-offset-2">
                        Add one
                      </Link>
                    }
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CategoryRow({
  category: c,
  editablePeriodId,
}: {
  category: CategoryProgress;
  editablePeriodId: string | null;
}) {
  const [plannedInput, setPlannedInput] = useState(String(c.planned));
  const [, startTransition] = useTransition();
  const txnCount = c.transactions.length;
  const pct = c.planned > 0 ? Math.min(100, (c.actual / c.planned) * 100) : c.actual > 0 ? 100 : 0;

  function save() {
    if (!editablePeriodId) return;
    const amount = Number(plannedInput || 0);
    if (amount === c.planned) return;
    startTransition(() => {
      upsertBudgetLine(c.id, editablePeriodId, amount);
    });
  }

  const color = getCategoryColor(c.id);

  return (
    <tr className="border-b border-border last:border-b-0 hover:bg-bg even:bg-bg/40">
      <td className="px-6 py-3">
        <div className="flex items-center gap-2.5">
          <span
            className="flex size-7 shrink-0 items-center justify-center rounded-full text-sm"
            style={{ backgroundColor: `${color}26` }}
          >
            {getCategoryIcon(c.name, c.icon)}
          </span>
          <span className="text-sm font-medium text-text">{c.name}</span>
        </div>
      </td>
      <td className="px-6 py-3">
        {editablePeriodId ? (
          <input
            type="number"
            step="0.01"
            value={plannedInput}
            onChange={(e) => setPlannedInput(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            className="tabular w-24 rounded-md border border-border bg-bg px-2 py-1 text-sm text-text outline-none focus:border-accent"
          />
        ) : (
          <span className="tabular text-sm text-text-muted">{formatMoney(c.planned)}</span>
        )}
      </td>
      <td className="tabular px-6 py-3 text-sm text-text">{formatMoney(c.actual)}</td>
      <td className="px-6 py-3">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-24 shrink-0 rounded-full bg-bg">
            <div
              className="h-1.5 rounded-full"
              style={{
                width: `${pct}%`,
                backgroundColor: c.overBudget ? "#f04438" : "var(--accent)",
              }}
            />
          </div>
          <span
            className={`tabular whitespace-nowrap text-xs font-medium ${
              c.overBudget ? "text-[#f04438]" : "text-text-muted"
            }`}
          >
            {c.remaining >= 0
              ? `${formatMoney(c.remaining)} left`
              : `${formatMoney(Math.abs(c.remaining))} over`}
          </span>
          {c.overBudget && <StatusPill variant="danger">Over</StatusPill>}
        </div>
      </td>
      <td className="px-6 py-3 text-right">
        {txnCount > 0 ? (
          <Link
            href={
              editablePeriodId
                ? `/transactions?period=${editablePeriodId}&category=${c.id}`
                : `/transactions?category=${c.id}`
            }
            className="whitespace-nowrap text-xs font-medium text-text-faint hover:text-accent"
          >
            {txnCount} {txnCount === 1 ? "txn" : "txns"} →
          </Link>
        ) : (
          <span className="text-xs text-text-faint">—</span>
        )}
      </td>
    </tr>
  );
}
