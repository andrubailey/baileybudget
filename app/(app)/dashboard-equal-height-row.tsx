"use client";

import { useLayoutEffect, useRef, useState } from "react";

// Budget Categories is the height "anchor" — always its own natural content
// height, never stretched or clipped. Plain CSS `items-stretch` can't give
// that on its own: the grid row auto-sizes to whichever card is *taller*,
// so a longer transaction list would drag Budget's height up with it (dead
// space at its bottom) instead of Budget staying independent. Measuring
// Budget's actual rendered height and applying it to Recent Transactions —
// which scrolls internally past that height instead of growing the row —
// is the only way to make Budget the one dictating the pair's height.
export function DashboardEqualHeightRow({
  budget,
  recent,
}: {
  budget: React.ReactNode;
  recent: React.ReactNode;
}) {
  const budgetRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = budgetRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height;
      if (h) setHeight(h);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start 2xl:grid-cols-5">
      <div ref={budgetRef} className="min-w-0 2xl:col-span-3">
        {budget}
      </div>
      <div
        className="flex min-w-0 flex-col overflow-hidden 2xl:col-span-2"
        style={height ? { height } : undefined}
      >
        {recent}
      </div>
    </div>
  );
}
