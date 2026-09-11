"use client";

import { useEffect } from "react";
import { generateRecurringForPeriod } from "@/app/actions";

// Rendered only when the page found recurring bills due for this period
// that haven't been posted yet. Fires the Server Action once on mount; the
// action inserts them and invalidates the cache, and the page re-renders
// with the new rows. Renders nothing itself.
export function RecurringPoster({ periodId }: { periodId: string }) {
  useEffect(() => {
    generateRecurringForPeriod(periodId).catch(() => {});
  }, [periodId]);
  return null;
}
