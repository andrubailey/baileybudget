"use client";

import { useState } from "react";
import { ProgressRow } from "@/components/ui";
import { CategoryChip } from "@/app/(app)/category-chip";
import { CategoryDetailPanel } from "@/app/(app)/category-detail-panel";
import type { CategoryProgress } from "@/lib/queries";

// A Money category row: tap opens the same detail panel (edit plan, see
// transactions) the desktop budget uses.
export function BudgetCategoryRow({
  category,
  caption,
  editablePeriodId,
  plannedLocked,
}: {
  category: CategoryProgress;
  caption: string | null;
  editablePeriodId: string;
  plannedLocked: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <ProgressRow
        icon={<CategoryChip id={category.id} name={category.name} icon={category.icon} showName={false} />}
        name={category.name}
        spent={category.actual}
        limit={category.planned}
        caption={caption}
        // Calm by default: the bar only turns caution once actually over.
        tone={category.overBudget ? "caution" : "positive"}
        onPress={() => setOpen(true)}
        hasPopup="dialog"
      />
      {open && (
        <CategoryDetailPanel
          category={category}
          editablePeriodId={editablePeriodId}
          plannedLocked={plannedLocked}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
