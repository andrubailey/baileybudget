"use client";

import Link from "next/link";
import { useState } from "react";
import type { CategoryProgress } from "@/lib/queries";
import { formatMoney } from "@/lib/format";
import { CategoryChip } from "@/app/(app)/category-chip";
import { SegmentedProgress } from "@/app/(app)/segmented-progress";

// Half-circle arc used for the budget gauge; pathLength=100 lets the fill be
// set directly as a percentage via strokeDasharray.
const ARC = "M 15 100 A 85 85 0 0 1 185 100";

// This month's spending by category, two ways: Expenses ranks where the
// money went, Budget shows total spend against the month's plan with the
// categories closest to (or past) their limit.
export function CategoryBreakdownCard({ categoryProgress }: { categoryProgress: CategoryProgress[] }) {
  const [tab, setTab] = useState<"expenses" | "budget">("budget");

  const spent = categoryProgress
    .filter((c) => c.actual > 0)
    .sort((a, b) => b.actual - a.actual);
  const totalSpent = spent.reduce((sum, c) => sum + c.actual, 0);

  const budgeted = categoryProgress
    .filter((c) => c.planned > 0)
    .sort((a, b) => b.actual / b.planned - a.actual / a.planned);
  const totalPlanned = budgeted.reduce((sum, c) => sum + c.planned, 0);
  const pct = totalPlanned > 0 ? (totalSpent / totalPlanned) * 100 : 0;
  const overBudget = totalPlanned > 0 && totalSpent > totalPlanned;

  return (
    <div className="card">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-heading text-text">Category breakdown</h2>
        <Link
          href="/spending/breakdown"
          className="text-xs font-medium text-text-faint transition-colors hover:text-text"
        >
          View All
        </Link>
      </div>

      <div role="tablist" className="grid grid-cols-2 border-b border-border">
        {(["expenses", "budget"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 pb-2 text-sm font-medium transition-colors ${
              tab === t
                ? "border-accent text-text"
                : "border-transparent text-text-muted hover:text-text"
            }`}
          >
            {t === "expenses" ? "Expenses" : "Budget"}
          </button>
        ))}
      </div>

      {tab === "budget" ? (
        totalPlanned === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-text-muted">No budget set for this month.</p>
            <Link
              href="/spending/breakdown?edit=1"
              className="mt-2 inline-block text-xs font-medium text-accent underline underline-offset-2"
            >
              Set up your budget
            </Link>
          </div>
        ) : (
          <>
            <div className="relative mx-auto mt-5 w-full max-w-[220px]">
              <svg viewBox="0 0 200 110" className="block w-full" aria-hidden="true">
                <path
                  d={ARC}
                  fill="none"
                  stroke="var(--neutral-track)"
                  strokeWidth={14}
                  strokeLinecap="round"
                  pathLength={100}
                />
                {pct > 0 && (
                  <path
                    d={ARC}
                    fill="none"
                    stroke={overBudget ? "var(--negative)" : "var(--accent)"}
                    strokeWidth={14}
                    strokeLinecap="round"
                    pathLength={100}
                    strokeDasharray={`${Math.min(100, pct)} 100`}
                  />
                )}
              </svg>
              <div className="absolute inset-x-0 bottom-0 text-center">
                <p className="tabular text-xs text-text-muted">{pct.toFixed(1)}%</p>
                <p className="tabular text-balance-sm text-text">{formatMoney(totalSpent)}</p>
                <p className="tabular text-xs text-text-faint">{formatMoney(totalPlanned)} budget</p>
              </div>
            </div>

            <ul className="mt-5 space-y-4">
              {budgeted.slice(0, 4).map((c) => {
                const catPct = (c.actual / c.planned) * 100;
                return (
                  <li key={c.id}>
                    <div className="flex items-center justify-between gap-3">
                      <CategoryChip id={c.id} name={c.name} icon={c.icon} className="min-w-0" />
                      <span className="tabular shrink-0 text-xs text-text-muted">
                        {formatMoney(c.actual)} of {formatMoney(c.planned)}
                      </span>
                    </div>
                    <SegmentedProgress pct={catPct} overBudget={c.overBudget} className="mt-1.5" />
                  </li>
                );
              })}
            </ul>
          </>
        )
      ) : spent.length === 0 ? (
        <p className="py-8 text-center text-sm text-text-muted">No spending this month yet.</p>
      ) : (
        <>
          <p className="mt-5 text-center">
            <span className="tabular text-balance-sm text-text">{formatMoney(totalSpent)}</span>
            <span className="mt-0.5 block text-xs text-text-faint">Spent this month</span>
          </p>
          <ul className="mt-5 divide-y divide-border">
            {spent.slice(0, 6).map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <CategoryChip id={c.id} name={c.name} icon={c.icon} />
                  <p className="text-metadata mt-0.5">
                    {((c.actual / totalSpent) * 100).toFixed(0)}% of expenses
                  </p>
                </div>
                <span className="tabular shrink-0 text-sm font-medium text-text">
                  {formatMoney(c.actual)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
