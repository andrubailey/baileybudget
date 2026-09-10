"use client";

import { useLayoutEffect, useRef, useState } from "react";

// Budget Categories is the height "anchor" — always its own natural content
// height, never stretched or clipped. Plain CSS `items-stretch` can't give
// that on its own: the grid row auto-sizes to whichever card is *taller*,
// so a longer transaction list would drag Budget's height up with it (dead
// space at its bottom) instead of Budget staying independent. Measuring
// Budget's actual rendered height and applying it to Recent Transactions —
// which trims to whatever fits that height instead of growing the row —
// is the only way to make Budget the one dictating the pair's height.
//
// Only applies once the two are actually side by side (lg+). Stacked on a
// phone, each card is its own natural height — pinning the recent list to
// the budget card's height there just clipped it for no reason.
const SIDE_BY_SIDE = "(min-width: 1024px)";

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
    const media = window.matchMedia(SIDE_BY_SIDE);
    let measured: number | null = null;
    function apply() {
      setHeight(media.matches ? measured : null);
    }
    const observer = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height;
      if (h) {
        measured = h;
        apply();
      }
    });
    observer.observe(el);
    media.addEventListener("change", apply);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", apply);
    };
  }, []);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start 2xl:grid-cols-5">
      <div ref={budgetRef} className="min-w-0 2xl:col-span-3">
        {budget}
      </div>
      <div
        className="flex min-w-0 flex-col overflow-hidden 2xl:col-span-2"
        data-pinned={height ? "true" : "false"}
        style={height ? { height } : undefined}
      >
        {recent}
      </div>
    </div>
  );
}
