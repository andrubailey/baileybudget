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
  limit,
}: {
  categoryProgress: CategoryProgress[];
  editablePeriodId: string | null;
  rangeIsSinglePeriod: boolean;
  // Caps how many rows render (over-budget first, then most active, then
  // alphabetical) so this card can match a sibling panel's height instead of
  // growing to list every category the household has ever created.
  limit?: number;
}) {
  const sorted = [...categoryProgress].sort((a, b) => {
    if (a.overBudget !== b.overBudget) return a.overBudget ? -1 : 1;
    const activity = b.actual + b.planned - (a.actual + a.planned);
    if (activity !== 0) return activity;
    return a.name.localeCompare(b.name);
  });
  const visible = limit ? sorted.slice(0, limit) : sorted;

  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-surface p-5 shadow-card sm:p-6">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="text-heading text-text">Budget Categories</h2>
        <Link
          href="/transactions?view=categories"
          className="text-xs font-medium text-text-faint hover:text-text"
        >
          View All
        </Link>
      </div>
      {!rangeIsSinglePeriod && categoryProgress.length > 0 && (
        <p className="mb-3 hidden text-xs text-text-faint sm:block">
          Switch to a single month to edit planned amounts
        </p>
      )}

      {sorted.length === 0 ? (
        <EmptyState
          message="No expense categories yet."
          action={
            <Link
              href="/transactions?view=categories"
              className="text-xs text-accent underline underline-offset-2"
            >
              Add one
            </Link>
          }
        />
      ) : (
        <>
          {/* Mobile: compact cards, no horizontal scroll. Desktop: full table. */}
          <div className="mt-3 space-y-2 sm:hidden">
            {visible.map((c) => (
              <MobileCategoryCard
                key={c.id}
                category={c}
                editablePeriodId={editablePeriodId}
              />
            ))}
          </div>

          <div className="mt-3 hidden overflow-x-auto sm:block">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-xs font-medium text-text-muted">
                    Name
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-text-muted">
                    Planned
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-text-muted">
                    Actual
                  </th>
                  <th className="px-3 py-2 text-xs font-medium text-text-muted">
                    Progress
                  </th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => (
                  <CategoryRow
                    key={c.id}
                    category={c}
                    editablePeriodId={editablePeriodId}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function MobileCategoryCard({
  category: c,
  editablePeriodId,
}: {
  category: CategoryProgress;
  editablePeriodId: string | null;
}) {
  const [plannedInput, setPlannedInput] = useState(String(c.planned));
  const [, startTransition] = useTransition();
  const pct =
    c.planned > 0
      ? Math.min(100, (c.actual / c.planned) * 100)
      : c.actual > 0
        ? 100
        : 0;
  const color = getCategoryColor(c.id);
  const isUnbudgeted = c.planned === 0 && c.actual === 0;

  function save() {
    if (!editablePeriodId) return;
    const amount = Number(plannedInput || 0);
    if (amount === c.planned) return;
    startTransition(() => {
      upsertBudgetLine(c.id, editablePeriodId, amount);
    });
  }

  return (
    <Link
      href={
        editablePeriodId
          ? `/transactions?period=${editablePeriodId}&category=${c.id}`
          : `/transactions?category=${c.id}`
      }
      className={`block rounded-xl border border-border bg-surface p-3 shadow-card ${
        isUnbudgeted ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-center gap-2.5">
        <span
          className="flex size-7 shrink-0 items-center justify-center rounded-full text-sm"
          style={{ backgroundColor: `${color}26` }}
        >
          {getCategoryIcon(c.name, c.icon)}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">
          {c.name}
        </span>
        <span
          className={`tabular shrink-0 text-sm font-semibold ${
            c.overBudget ? "text-[#f04438]" : "text-text"
          }`}
        >
          {c.remaining >= 0
            ? formatMoney(c.remaining)
            : `-${formatMoney(Math.abs(c.remaining))}`}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="h-1.5 min-w-0 flex-1 rounded-full bg-[#dde1d8]">
          {(c.planned > 0 || c.actual > 0) && (
            <div
              className="h-1.5 rounded-full"
              style={{
                width: `${pct}%`,
                backgroundColor: c.overBudget ? "#f04438" : "var(--accent)",
              }}
            />
          )}
        </div>
        {editablePeriodId ? (
          <label
            className="relative shrink-0"
            onClick={(e) => e.preventDefault()}
          >
            <span className="pointer-events-none absolute top-1/2 left-1.5 -translate-y-1/2 text-xs text-text-faint">
              $
            </span>
            <input
              type="number"
              step="0.01"
              value={plannedInput}
              onChange={(e) => setPlannedInput(e.target.value)}
              onBlur={save}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              className="tabular no-spinner w-16 rounded-md border border-border bg-bg py-0.5 pr-1.5 pl-3.5 text-right text-xs text-text outline-none focus:border-accent"
            />
          </label>
        ) : (
          <span className="tabular shrink-0 text-xs text-text-faint">
            {formatMoney(c.planned)}
          </span>
        )}
      </div>
    </Link>
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
  const pct =
    c.planned > 0
      ? Math.min(100, (c.actual / c.planned) * 100)
      : c.actual > 0
        ? 100
        : 0;

  function save() {
    if (!editablePeriodId) return;
    const amount = Number(plannedInput || 0);
    if (amount === c.planned) return;
    startTransition(() => {
      upsertBudgetLine(c.id, editablePeriodId, amount);
    });
  }

  const color = getCategoryColor(c.id);
  const isUnbudgeted = c.planned === 0 && c.actual === 0;

  return (
    <tr
      className={`border-b border-border last:border-b-0 hover:bg-bg even:bg-bg/40 ${
        isUnbudgeted ? "opacity-60" : ""
      }`}
    >
      <td className="px-3 py-3">
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
      <td className="px-3 py-3 text-right">
        {editablePeriodId ? (
          <label className="relative inline-block">
            <span className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-sm text-text-faint">
              $
            </span>
            <input
              type="number"
              step="0.01"
              value={plannedInput}
              onChange={(e) => setPlannedInput(e.target.value)}
              onBlur={save}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              className="tabular no-spinner w-24 rounded-md border border-border bg-bg py-1 pr-2 pl-5 text-right text-sm text-text outline-none focus:border-accent"
            />
          </label>
        ) : (
          <span className="tabular text-sm text-text-muted">
            {formatMoney(c.planned)}
          </span>
        )}
      </td>
      <td className="tabular px-3 py-3 text-right text-sm text-text">
        {formatMoney(c.actual)}
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-24 shrink-0 rounded-full bg-[#dde1d8]">
            {(c.planned > 0 || c.actual > 0) && (
              <div
                className="h-1.5 rounded-full"
                style={{
                  width: `${pct}%`,
                  backgroundColor: c.overBudget ? "#f04438" : "var(--accent)",
                }}
              />
            )}
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
      <td className="px-3 py-3 text-right">
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
