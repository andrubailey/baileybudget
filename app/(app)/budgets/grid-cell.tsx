"use client";

import { useState, useTransition } from "react";
import { deleteBudgetLine, upsertBudgetLine } from "@/app/actions";
import { useToast } from "@/app/(app)/toast";

// One editable planned-amount cell — shared by the single-month table and
// the full multi-month matrix, so both save the same way.
export function GridCell({
  categoryId,
  periodId,
  initialValue,
  bare = false,
  cellClassName = "px-4 py-3",
}: {
  categoryId: string;
  periodId: string;
  initialValue: number;
  // Renders just the <input> with no <td> wrapper, for use outside a table
  // (the mobile card layout puts this in a flex row instead).
  bare?: boolean;
  // Override the wrapping <td>'s padding — callers with a roomier column
  // layout than the default table can widen the gap around the input.
  cellClassName?: string;
}) {
  const [value, setValue] = useState(initialValue ? String(initialValue) : "");
  // "Copy budget from last month" (or any other bulk write) revalidates and
  // hands this already-mounted cell a fresh `initialValue` — without this,
  // the input would keep showing whatever it had on mount instead of the
  // newly-copied amount.
  const [lastInitialValue, setLastInitialValue] = useState(initialValue);
  if (initialValue !== lastInitialValue) {
    setLastInitialValue(initialValue);
    setValue(initialValue ? String(initialValue) : "");
  }
  const [, startTransition] = useTransition();
  // Brief highlight after a blur-triggered save resolves — these cells save
  // silently otherwise, with nothing to tell you the edit actually landed.
  const [justSaved, setJustSaved] = useState(false);
  const showToast = useToast();

  function save() {
    const trimmed = value.trim();
    if (trimmed === "" && !initialValue) return; // already unset, nothing to do
    if (trimmed !== "" && Number(trimmed) === initialValue) return; // unchanged
    startTransition(async () => {
      // Clearing the field entirely deletes that month's planned amount
      // instead of saving an explicit $0 — lets "Copy budget from last
      // month" treat this month as genuinely unbudgeted again, and is how
      // you remove a category's plan for just one month without touching
      // the category itself.
      const result =
        trimmed === ""
          ? await deleteBudgetLine(categoryId, periodId)
          : await upsertBudgetLine(categoryId, periodId, Number(trimmed));
      if (!result.ok) {
        showToast(result.error ? `Couldn't save: ${result.error}` : "Couldn't save planned amount");
        return;
      }
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 1200);
    });
  }

  const input = (
    <input
      type="number"
      step="0.01"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      title="Clear and click away to remove this month's planned amount"
      className={`tabular w-24 rounded-md border bg-bg px-2 py-1 text-sm text-text outline-none transition-colors focus:border-accent ${
        justSaved ? "border-success" : "border-border"
      }`}
    />
  );

  if (bare) return input;

  return <td className={cellClassName}>{input}</td>;
}
