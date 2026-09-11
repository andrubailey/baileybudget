"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { upsertBudgetLine } from "@/app/actions";
import { Money } from "@/app/(app)/money";
import { CategoryChip } from "@/app/(app)/category-chip";
import { CategoryDetailPanel } from "@/app/(app)/category-detail-panel";
import { EmptyState } from "@/app/(app)/empty-state";
import { useToast } from "@/app/(app)/toast";
import { SegmentedProgress } from "@/app/(app)/segmented-progress";
import { useContextMenu } from "@/app/(app)/context-menu";
import { categoryMenuItems, useCategoryQuickActions } from "@/app/(app)/category-menu";
import type { CategoryProgress } from "@/lib/queries";

// Straight-line projection: whatever pace spend has run at through today
// carried across the rest of the period. Deliberately simple (no weighting
// for "rent posts on the 1st" front-loading, say) — the point is a
// ballpark of where this category lands if nothing changes, not a forecast
// precise enough to argue with.
function projectedTotal(actual: number, pace: { daysElapsed: number; daysTotal: number }): number {
  if (pace.daysElapsed <= 0) return actual;
  return (actual / pace.daysElapsed) * pace.daysTotal;
}

// Small checkmark that fades in on a successful save and back out a moment
// later — the planned-amount edit otherwise had zero acknowledgment beyond
// the input losing focus, so there was no way to tell a save landed.
function SavedCheck({ show }: { show: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={`shrink-0 text-success transition-opacity duration-300 ${show ? "opacity-100" : "opacity-0"}`}
    >
      <path
        d="M5 13l4 4L19 7"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export type BudgetPace = { daysElapsed: number; daysTotal: number };

export function BudgetCategoriesCard({
  categoryProgress,
  editablePeriodId,
  rangeIsSinglePeriod,
  limit,
  pace,
}: {
  categoryProgress: CategoryProgress[];
  editablePeriodId: string | null;
  rangeIsSinglePeriod: boolean;
  // Optionally caps how many rows render, for a context that wants this
  // card to match a sibling panel's height instead of listing every
  // budgeted category.
  limit?: number;
  // Set only when the visible period is the one actually in progress right
  // now — lets each row project "at this rate you'll land at $X" instead of
  // just showing actual-vs-planned with no sense of how much of the month
  // is even over yet.
  pace?: BudgetPace | null;
}) {
  // Which category's detail panel is open, if any.
  const [detailId, setDetailId] = useState<string | null>(null);

  // Right-click menu, shared with the Spending breakdown's category tables.
  const contextMenu = useContextMenu();
  const categoryActions = useCategoryQuickActions();
  function openMenu(e: React.MouseEvent, c: CategoryProgress) {
    contextMenu.open(
      e,
      categoryMenuItems(c, {
        periodId: editablePeriodId,
        onOpen: () => setDetailId(c.id),
        // Jump straight into this row's amount field (desktop table or
        // phone card, whichever is showing); fall back to the panel.
        onSetBudget: () => {
          const input = [...document.querySelectorAll<HTMLInputElement>(`[data-planned-input="${c.id}"]`)].find(
            (el) => el.offsetParent !== null,
          );
          if (input) {
            input.focus();
            input.select();
          } else {
            setDetailId(c.id);
          }
        },
        actions: categoryActions,
      }),
    );
  }

  // The full month's budget: every category that actually has money
  // attached (planned or spent) rather than every category the household
  // has ever created, alphabetical so it reads as a scannable list instead
  // of reshuffling by activity every time a number changes.
  const sorted = [...categoryProgress]
    .filter((c) => c.planned !== 0 || c.actual !== 0)
    .sort((a, b) => a.name.localeCompare(b.name));
  const visible = limit ? sorted.slice(0, limit) : sorted;
  // Subtotal is across every budgeted category this month, not just the
  // ones actually rendered — `limit` only caps how many rows this card
  // shows, it shouldn't make the total look smaller than it really is.
  const totalPlanned = sorted.reduce((sum, c) => sum + c.planned, 0);
  const totalActual = sorted.reduce((sum, c) => sum + c.actual, 0);
  const detailCategory = detailId ? (sorted.find((c) => c.id === detailId) ?? null) : null;

  return (
    <div className="card flex min-w-0 flex-col overflow-hidden">
      <div className="mb-4 flex items-center justify-between gap-3">
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
          compact
          action={
            <Link
              href="/spending/breakdown?edit=1"
              className="text-xs font-medium text-accent underline underline-offset-2"
            >
              Set up your budget
            </Link>
          }
        />
      ) : (
        <>
          {/* Mobile: compact cards, no horizontal scroll. Desktop: full table. */}
          <div className="mt-3 space-y-2 sm:hidden">
            {visible.map((c, i) => (
              <MobileCategoryCard
                key={c.id}
                category={c}
                editablePeriodId={editablePeriodId}
                index={i}
                pace={pace}
                onOpen={() => setDetailId(c.id)}
                onContextMenu={(e) => openMenu(e, c)}
              />
            ))}
            <div className="flex items-center justify-between rounded-lg bg-bg px-3 py-2 text-xs font-semibold text-text">
              <span>Subtotal</span>
              <span className="flex items-center gap-1">
                <Money amount={totalPlanned} className="tabular" /> planned ·
                <Money amount={totalActual} className="tabular" /> actual
              </span>
            </div>
          </div>

          <div className="mt-3 hidden overflow-x-auto sm:block">
            {/* table-fixed with a share per column and ordinary padding —
                every cell's content has to fit inside its own column, so
                nothing (like the progress bar) can draw over a neighbor.
                Planned and Actual are right-aligned so their figures line
                up with the Subtotal row beneath them. */}
            <table className="w-full min-w-[640px] table-fixed text-left">
              <thead>
                <tr className="border-b border-border">
                  <th className="w-[30%] px-4 py-2 text-xs font-medium text-text-muted">
                    Name
                  </th>
                  <th className="w-[18%] px-4 py-2 text-right text-xs font-medium text-text-muted">
                    Planned
                  </th>
                  <th className="w-[18%] px-4 py-2 text-right text-xs font-medium text-text-muted">
                    Actual
                  </th>
                  <th className="w-[34%] px-4 py-2 text-right text-xs font-medium text-text-muted">
                    Progress
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((c, i) => (
                  <CategoryRow
                    key={c.id}
                    category={c}
                    editablePeriodId={editablePeriodId}
                    index={i}
                    pace={pace}
                    onOpen={() => setDetailId(c.id)}
                    onContextMenu={(e) => openMenu(e, c)}
                  />
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border">
                  <td className="px-4 py-2 text-xs font-semibold text-text">
                    Subtotal
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Money amount={totalPlanned} className="tabular text-sm font-semibold text-text" />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Money amount={totalActual} className="tabular text-sm font-semibold text-text" />
                  </td>
                  <td className="px-4 py-2" />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      {contextMenu.menu}
      {detailCategory && (
        <CategoryDetailPanel
          key={detailCategory.id}
          category={detailCategory}
          editablePeriodId={editablePeriodId}
          onClose={() => setDetailId(null)}
        />
      )}
    </div>
  );
}

function MobileCategoryCard({
  category: c,
  editablePeriodId,
  index = 0,
  pace,
  onOpen,
  onContextMenu,
}: {
  category: CategoryProgress;
  editablePeriodId: string | null;
  index?: number;
  pace?: { daysElapsed: number; daysTotal: number } | null;
  onOpen: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const [plannedInput, setPlannedInput] = useState(String(c.planned));
  // A save elsewhere (e.g. the detail panel) revalidates and hands this a
  // fresh `planned` — resync so the inline input doesn't show a stale value.
  const [lastPlanned, setLastPlanned] = useState(c.planned);
  if (c.planned !== lastPlanned) {
    setLastPlanned(c.planned);
    setPlannedInput(String(c.planned));
  }
  const [, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const showToast = useToast();
  const isUnbudgeted = c.planned === 0 && c.actual === 0;
  const projected =
    pace && c.planned > 0 && !isUnbudgeted ? projectedTotal(c.actual, pace) : null;

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 1200);
    return () => clearTimeout(timer);
  }, [saved]);

  function save() {
    if (!editablePeriodId) return;
    const amount = Number(plannedInput || 0);
    if (amount === c.planned) return;
    startTransition(async () => {
      const result = await upsertBudgetLine(c.id, editablePeriodId, amount);
      if (!result.ok) {
        showToast(result.error ? `Couldn't save: ${result.error}` : "Couldn't save planned amount");
        return;
      }
      setSaved(true);
    });
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onContextMenu={onContextMenu}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      style={{ animationDelay: `${index * 12}ms` }}
      className={`animate-fade-in-up block cursor-pointer rounded-xl border border-border bg-surface p-3 shadow-card transition-colors ${
        isUnbudgeted ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-center gap-2.5">
        <CategoryChip id={c.id} name={c.name} icon={c.icon} className="min-w-0 flex-1" />
        <Money
          amount={c.remaining}
          signDisplay="auto"
          tone={c.overBudget ? "negative" : "neutral"}
          className="shrink-0 text-sm font-semibold"
        />
      </div>
      {/* No progress bar here — Planned vs. Actual side by side reads
          faster on a phone than a bar you have to interpret, and the
          Remaining figure above already carries the over-budget signal. */}
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs text-text-faint">
          Planned
          {editablePeriodId ? (
            <label className="relative" onClick={(e) => e.stopPropagation()}>
              <span className="pointer-events-none absolute top-1/2 left-1.5 -translate-y-1/2 text-xs text-text-faint">
                $
              </span>
              <input
                data-planned-input={c.id}
                type="number"
                step="0.01"
                value={plannedInput}
                onChange={(e) => setPlannedInput(e.target.value)}
                onBlur={save}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
                className="tabular no-spinner w-16 rounded-md border border-border bg-bg py-0.5 pr-1.5 pl-3.5 text-right text-xs text-text outline-none focus:border-accent"
              />
            </label>
          ) : (
            <Money amount={c.planned} className="text-xs font-medium text-text" />
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-text-faint">
          Actual
          <Money
            amount={c.actual}
            tone={c.overBudget ? "negative" : "neutral"}
            className="text-xs font-medium"
          />
        </span>
        {editablePeriodId && <SavedCheck show={saved} />}
      </div>
      {projected !== null && (
        <p
          className={`mt-1.5 text-xs ${
            projected > c.planned ? "text-negative" : "text-text-faint"
          }`}
        >
          On pace for <Money amount={projected} className="text-xs font-medium" />
        </p>
      )}
    </div>
  );
}

function CategoryRow({
  category: c,
  editablePeriodId,
  index = 0,
  pace,
  onOpen,
  onContextMenu,
}: {
  category: CategoryProgress;
  editablePeriodId: string | null;
  index?: number;
  pace?: { daysElapsed: number; daysTotal: number } | null;
  onOpen: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const [plannedInput, setPlannedInput] = useState(String(c.planned));
  // A save elsewhere (e.g. the detail panel) revalidates and hands this a
  // fresh `planned` — resync so the inline input doesn't show a stale value.
  const [lastPlanned, setLastPlanned] = useState(c.planned);
  if (c.planned !== lastPlanned) {
    setLastPlanned(c.planned);
    setPlannedInput(String(c.planned));
  }
  const [, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const showToast = useToast();
  const pct =
    c.planned > 0
      ? Math.min(100, (c.actual / c.planned) * 100)
      : c.actual > 0
        ? 100
        : 0;
  const isUnbudgeted = c.planned === 0 && c.actual === 0;
  const projected =
    pace && c.planned > 0 && !isUnbudgeted ? projectedTotal(c.actual, pace) : null;

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 1200);
    return () => clearTimeout(timer);
  }, [saved]);

  function save() {
    if (!editablePeriodId) return;
    const amount = Number(plannedInput || 0);
    if (amount === c.planned) return;
    startTransition(async () => {
      const result = await upsertBudgetLine(c.id, editablePeriodId, amount);
      if (!result.ok) {
        showToast(result.error ? `Couldn't save: ${result.error}` : "Couldn't save planned amount");
        return;
      }
      setSaved(true);
    });
  }

  return (
    <tr
      onClick={onOpen}
      onContextMenu={onContextMenu}
      onKeyDown={(e) => {
        // Only react when the row itself is focused, not a descendant
        // (the planned-amount input already handles its own Enter key) —
        // otherwise pressing Enter to save that input would also open the
        // detail panel.
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`${c.name} details`}
      style={{ animationDelay: `${index * 12}ms` }}
      className={`animate-fade-in-up cursor-pointer border-b border-border transition-colors last:border-b-0 hover:bg-bg even:bg-bg/40 ${
        isUnbudgeted ? "opacity-60" : ""
      }`}
    >
      <td className="px-4 py-3">
        <CategoryChip id={c.id} name={c.name} icon={c.icon} />
      </td>
      <td className="px-4 py-3 text-right">
        {editablePeriodId ? (
          // The checkmark floats outside the input's box (absolute, not in
          // flow) so it never reserves space and shifts the input off the
          // column's right edge, where the Subtotal figure lines up.
          <label
            className="relative inline-block"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-sm text-text-faint">
              $
            </span>
            <input
              data-planned-input={c.id}
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
            <span className="absolute top-1/2 right-full mr-1.5 -translate-y-1/2">
              <SavedCheck show={saved} />
            </span>
          </label>
        ) : (
          <Money amount={c.planned} className="text-sm text-text-muted" />
        )}
      </td>
      <td className="px-4 py-3 text-right text-sm">
        <Money amount={c.actual} tone={c.overBudget ? "negative" : "neutral"} />
      </td>
      <td className="py-3 pr-4 pl-8">
        <div className="flex items-center justify-end gap-3">
          <SegmentedProgress pct={pct} overBudget={c.overBudget} className="min-w-0 flex-1" />
          <div className="w-24 shrink-0 text-right">
            <span
              className={`text-xs font-medium whitespace-nowrap ${
                c.overBudget ? "text-negative" : "text-text-muted"
              }`}
            >
              <Money amount={c.remaining} /> {c.remaining >= 0 ? "left" : "over"}
            </span>
            {projected !== null && (
              <p
                className={`text-[11px] whitespace-nowrap ${
                  projected > c.planned ? "text-negative" : "text-text-faint"
                }`}
              >
                Pace: <Money amount={projected} className="text-[11px]" />
              </p>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}
