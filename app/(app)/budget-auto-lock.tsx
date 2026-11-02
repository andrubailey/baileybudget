"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { autoLockCurrentPeriod } from "@/app/actions";

// Rendered only while the current month is still unlocked. Once the viewer's
// local date is past the 3-day cushion, the first page load locks the plan.
export function BudgetAutoLock({ periodStart, periodEnd }: { periodStart: string; periodEnd: string }) {
  const router = useRouter();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const lockFrom = new Date(`${periodStart}T00:00:00Z`);
    lockFrom.setUTCDate(lockFrom.getUTCDate() + 3);
    if (today < lockFrom.toISOString().slice(0, 10) || today > periodEnd) return;
    fired.current = true;
    autoLockCurrentPeriod(today).then((result) => {
      if (result.locked) router.refresh();
    });
  }, [periodStart, periodEnd, router]);

  return null;
}
