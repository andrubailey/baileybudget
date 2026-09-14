"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatMoney } from "@/lib/format";
import type { Account, Category } from "@/lib/types";
import { CategoryChip } from "@/app/(app)/category-chip";
import { EmptyState } from "@/app/(app)/empty-state";
import { SegmentedProgress } from "@/app/(app)/segmented-progress";
import { CategoryDetailDrawer } from "./category-detail-drawer";
import { useContextMenu } from "@/app/(app)/context-menu";
import { categoryMenuItems, useCategoryQuickActions } from "@/app/(app)/category-menu";
import type { CategoryRow } from "../build-category-rows";

// Re-exported so existing `import type { CategoryRow } from "./breakdown-panel"`
// call sites (budget-editor.tsx) keep working — build-category-rows.ts is
// the canonical definition now, shared with the Budget page.
export type { CategoryRow };

export type IncomeRow = { id: string; name: string; icon: string | null; actual: number };

// Budget lives on its own subpage (/spending/budget), so it isn't a tab here.
type Tab = "expenses" | "income";

// "$38.00 left" in muted text, or "$34.00 over" in red.
function LeftOrOver({ amount }: { amount: number }) {
  return amount >= 0 ? (
    <span className="tabular text-text-muted">{formatMoney(amount)} left</span>
  ) : (
    <span className="tabular font-medium text-negative">{formatMoney(-amount)} over</span>
  );
}

// The Spending page's category breakdown, in the same style as the
// Overview's Budget card: each category is spent vs. its budget, with the
// app's pill bar and how much is left or over. Largest spend first.
export function BreakdownPanel({
  periodId,
  periodName,
  rows,
  incomeRows,
  totalIncome,
  accounts,
  categories,
}: {
  periodId: string;
  periodName: string;
  rows: CategoryRow[];
  incomeRows: IncomeRow[];
  totalIncome: number;
  accounts: Account[];
  categories: Category[];
}) {
  const [tab, setTab] = useState<Tab>("expenses");
  const [openId, setOpenId] = useState<string | null>(null);

  // Right-click menu, shared with the Overview's Budget card. "Set budget"
  // opens the category panel, which edits the budget in place.
  const contextMenu = useContextMenu();
  const categoryActions = useCategoryQuickActions();
  function openMenu(e: React.MouseEvent, r: CategoryRow) {
    contextMenu.open(
      e,
      categoryMenuItems(r, {
        periodId,
        onOpen: () => setOpenId(r.id),
        onSetBudget: () => setOpenId(r.id),
        actions: categoryActions,
      }),
    );
  }

  const monthName = periodName.split(" ")[0];
  // Every category with money attached this month — budgeted or spent.
  const budgetRows = useMemo(
    () =>
      rows
        .filter((r) => r.planned > 0 || r.actual > 0)
        .sort((a, b) => b.actual - a.actual || a.name.localeCompare(b.name)),
    [rows],
  );
  const totalSpent = budgetRows.reduce((s, r) => s + r.actual, 0);
  const totalPlanned = rows.reduce((s, r) => s + Math.max(0, r.planned), 0);
  const totalPct = totalPlanned > 0 ? (totalSpent / totalPlanned) * 100 : 0;

  const openRow = openId ? (rows.find((r) => r.id === openId) ?? null) : null;

  return (
    <>
      <div className="card-flush">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <p className="text-section-label">Category breakdown</p>
          <Link
            href="/spending/budget"
            aria-label="Edit budget"
            className="flex size-8 items-center justify-center rounded-lg border border-border text-text-muted transition-colors hover:bg-bg hover:text-text"
          >
            <PencilIcon />
          </Link>
        </div>

        <div role="tablist" className="grid grid-cols-2 border-b border-border">
          {(["expenses", "income"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`-mb-px border-b-2 py-3 text-sm font-medium capitalize transition-colors ${
                tab === t ? "border-text text-text" : "border-transparent text-text-muted hover:text-text"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* ---- Expenses ---- */}
        {tab === "expenses" && (
          <div className="px-5 py-5">
            <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
              <div>
                <p className="text-sm text-text-muted">Spent in {monthName}</p>
                <p className="tabular text-balance-display mt-0.5 text-text">{formatMoney(totalSpent)}</p>
              </div>
              {totalPlanned > 0 && (
                <p className="tabular pb-1 text-sm text-text-muted">of {formatMoney(totalPlanned)} budget</p>
              )}
            </div>
            {totalPlanned > 0 && (
              <>
                <SegmentedProgress pct={totalPct} overBudget={totalSpent > totalPlanned} className="mt-3" />
                <div className="mt-1.5 flex items-center justify-between text-xs">
                  <span className="tabular text-text-faint">{Math.round(totalPct)}% used</span>
                  <LeftOrOver amount={totalPlanned - totalSpent} />
                </div>
              </>
            )}

            {budgetRows.length === 0 ? (
              <div className="mt-6">
                <EmptyState
                  compact
                  message={`No spending or budget for ${periodName} yet.`}
                  shortcut={{ keys: ["⌥", "E"], label: "to log an expense" }}
                />
              </div>
            ) : (
              <ul className="mt-5 divide-y divide-border border-t border-border">
                {budgetRows.map((r, i) => {
                  const hasBudget = r.planned > 0;
                  const pct = hasBudget ? (r.actual / r.planned) * 100 : 100;
                  const over = hasBudget && r.actual > r.planned;
                  return (
                    <li key={r.id} className="animate-fade-in-up" style={{ animationDelay: `${i * 12}ms` }}>
                      <button
                        type="button"
                        onClick={() => setOpenId(r.id)}
                        onContextMenu={(e) => openMenu(e, r)}
                        className="-mx-2 block w-[calc(100%+1rem)] rounded-lg px-2 py-3 text-left transition-colors hover:bg-bg"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <CategoryChip id={r.id} name={r.name} icon={r.icon} className="min-w-0" />
                          <span className="tabular shrink-0 text-sm">
                            <span className={`font-medium ${over ? "text-negative" : "text-text"}`}>
                              {formatMoney(r.actual)}
                            </span>
                            {hasBudget && <span className="text-text-faint"> of {formatMoney(r.planned)}</span>}
                          </span>
                        </div>
                        <SegmentedProgress
                          pct={pct}
                          overBudget={over}
                          // Spending with no budget gets a neutral bar, not a
                          // red "over" one — nothing was planned to go over.
                          color={hasBudget ? undefined : "var(--text-faint)"}
                          className="mt-2.5"
                        />
                        <div className="mt-1.5 flex items-center justify-between text-xs">
                          <span className="tabular text-text-faint">
                            {hasBudget ? `${Math.round(pct)}% used` : "No budget set"}
                          </span>
                          {hasBudget ? (
                            <LeftOrOver amount={r.planned - r.actual} />
                          ) : (
                            <span className="text-text-faint">Unbudgeted</span>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {/* ---- Income ---- */}
        {tab === "income" && (
          <div className="px-5 py-5">
            <div>
              <p className="text-sm text-text-muted">Earned in {monthName}</p>
              <p className="tabular text-balance-display mt-0.5 text-text">{formatMoney(totalIncome)}</p>
            </div>
            {incomeRows.length === 0 ? (
              <div className="mt-6">
                <EmptyState
                  compact
                  message={`No income logged for ${periodName} yet.`}
                  shortcut={{ keys: ["⌥", "I"], label: "to log income" }}
                />
              </div>
            ) : (
              <ul className="mt-5 divide-y divide-border border-t border-border">
                {incomeRows.map((r, i) => {
                  const share = totalIncome > 0 ? (r.actual / totalIncome) * 100 : 0;
                  return (
                    <li
                      key={r.id}
                      className="animate-fade-in-up py-3"
                      style={{ animationDelay: `${i * 12}ms` }}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <CategoryChip id={r.id} name={r.name} icon={r.icon} className="min-w-0" />
                        <span className="tabular shrink-0 text-sm font-medium text-positive">
                          +{formatMoney(r.actual)}
                        </span>
                      </div>
                      <SegmentedProgress pct={share} overBudget={false} color="var(--positive)" className="mt-2.5" />
                      <p className="tabular mt-1.5 text-right text-xs text-text-faint">
                        {Math.round(share)}% of income
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      {contextMenu.menu}
      {openRow && (
        <CategoryDetailDrawer
          row={openRow}
          periodId={periodId}
          periodName={periodName}
          accounts={accounts}
          categories={categories}
          onClose={() => setOpenId(null)}
        />
      )}
    </>
  );
}

export function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z M13.5 6.5l3 3"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
