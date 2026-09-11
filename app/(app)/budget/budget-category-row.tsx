"use client";

import { useState } from "react";
import { Money } from "@/app/(app)/money";
import { CategoryChip } from "@/app/(app)/category-chip";
import { SegmentedProgress } from "@/app/(app)/segmented-progress";
import { CategoryDetailPanel } from "@/app/(app)/category-detail-panel";
import type { CategoryProgress } from "@/lib/queries";

// One row: colored category icon + name, a thin progress bar, "$actual of
// $of" right-aligned. `of` is the row's own denominator — the category's
// planned amount on the Budget tab, or the tab's running total on Expenses/
// Income (where "planned" doesn't mean anything), so the row always reads
// as "how much of this bucket did this category account for."
export function BudgetCategoryRow({
  id,
  name,
  icon,
  actual,
  of,
  overBudget = false,
  index = 0,
  detail,
  editablePeriodId,
}: {
  id: string;
  name: string;
  icon: string | null;
  actual: number;
  of: number;
  overBudget?: boolean;
  index?: number;
  // Full CategoryProgress backs the tap-to-open detail panel — only present
  // on the Budget/Expenses tabs, which have real planned/remaining figures.
  // Income rows (no planned concept) render read-only.
  detail?: CategoryProgress;
  editablePeriodId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const pct = of > 0 ? Math.min(100, (actual / of) * 100) : actual > 0 ? 100 : 0;

  const row = (
    <div
      style={{ animationDelay: `${index * 12}ms` }}
      className="animate-fade-in-up flex items-center gap-3 py-3 first:pt-0 last:pb-0"
    >
      <CategoryChip id={id} name={name} icon={icon} className="min-w-0 flex-1" />
      <div className="w-24 shrink-0">
        <SegmentedProgress pct={pct} overBudget={overBudget} className="w-full" />
      </div>
      <span className="tabular shrink-0 text-xs font-medium whitespace-nowrap text-text-muted">
        <Money amount={actual} className="text-text" /> of <Money amount={of} />
      </span>
    </div>
  );

  if (!detail) return row;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="block w-full text-left">
        {row}
      </button>
      {open && (
        <CategoryDetailPanel
          category={detail}
          editablePeriodId={editablePeriodId ?? null}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
