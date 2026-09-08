"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { upsertBudgetLine } from "@/app/actions";
import { formatMoney } from "@/lib/format";
import { getCategoryIcon } from "@/lib/category-icons";
import { getCategoryColor } from "@/lib/category-colors";
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
  // Optionally caps how many rows render, for a context that wants this
  // card to match a sibling panel's height instead of listing every
  // budgeted category.
  limit?: number;
}) {
  // The full month's budget: every category that actually has money
  // attached (planned or spent) rather than every category the household
  // has ever created, alphabetical so it reads as a scannable list instead
  // of reshuffling by activity every time a number changes.
  const sorted = [...categoryProgress]
    .filter((c) => c.planned !== 0 || c.actual !== 0)
    .sort((a, b) => a.name.localeCompare(b.name));
  const visible = limit ? sorted.slice(0, limit) : sorted;

  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-surface p-5 shadow-card sm:p-6">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="text-heading text-text">Budget</h2>
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
                  <th className="px-4 py-2 text-xs font-medium text-text-muted">
                    Name
                  </th>
                  <th className="w-28 px-4 py-2 text-right text-xs font-medium text-text-muted">
                    Planned
                  </th>
                  <th className="w-28 px-4 py-2 text-right text-xs font-medium text-text-muted">
                    Actual
                  </th>
                  <th className="w-[200px] px-4 py-2 text-right text-xs font-medium text-text-muted">
                    Progress
                  </th>
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
            c.overBudget ? "text-negative" : "text-text"
          }`}
        >
          {c.remaining >= 0
            ? formatMoney(c.remaining)
            : `-${formatMoney(Math.abs(c.remaining))}`}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="h-1.5 min-w-0 flex-1 rounded-full bg-neutral-track">
          {(c.planned > 0 || c.actual > 0) && (
            <div
              className="animate-bar-grow-x h-1.5 rounded-full transition-colors duration-300"
              style={{
                width: `${pct}%`,
                backgroundColor: c.overBudget ? "var(--negative)" : "var(--accent)",
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
  const router = useRouter();
  const [plannedInput, setPlannedInput] = useState(String(c.planned));
  const [, startTransition] = useTransition();
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
  const href = editablePeriodId
    ? `/transactions?period=${editablePeriodId}&category=${c.id}`
    : `/transactions?category=${c.id}`;

  return (
    <tr
      onClick={() => router.push(href)}
      onKeyDown={(e) => {
        // Only react when the row itself is focused, not a descendant
        // (the planned-amount input already handles its own Enter key) —
        // otherwise pressing Enter to save that input would also navigate.
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          router.push(href);
        }
      }}
      role="link"
      tabIndex={0}
      className={`cursor-pointer border-b border-border last:border-b-0 hover:bg-bg even:bg-bg/40 ${
        isUnbudgeted ? "opacity-60" : ""
      }`}
    >
      <td className="px-4 py-3">
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
      <td className="px-4 py-3 text-right">
        {editablePeriodId ? (
          <label
            className="relative inline-block"
            onClick={(e) => e.stopPropagation()}
          >
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
      <td className="tabular px-4 py-3 text-right text-sm text-text">
        {formatMoney(c.actual)}
      </td>
      <td className="w-[200px] px-4 py-3">
        <div className="flex items-center justify-end gap-2">
          <div className="h-1.5 w-24 shrink-0 rounded-full bg-neutral-track">
            {(c.planned > 0 || c.actual > 0) && (
              <div
                className="animate-bar-grow-x h-1.5 rounded-full transition-colors duration-300"
                style={{
                  width: `${pct}%`,
                  backgroundColor: c.overBudget ? "var(--negative)" : "var(--accent)",
                }}
              />
            )}
          </div>
          <span
            className={`tabular w-20 shrink-0 text-right text-xs font-medium whitespace-nowrap ${
              c.overBudget ? "text-negative" : "text-text-muted"
            }`}
          >
            {c.remaining >= 0
              ? `${formatMoney(c.remaining)} left`
              : `${formatMoney(Math.abs(c.remaining))} over`}
          </span>
        </div>
      </td>
    </tr>
  );
}
