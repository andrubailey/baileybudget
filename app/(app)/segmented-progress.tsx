"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { observeWidth } from "@/lib/shared-width-observer";

// A row of thin vertical pills instead of one continuous bar — each segment
// represents an even slice of 100%, filling left to right as spend catches
// up to plan. Each filled pill grows in with its own stagger, so the fill
// visibly sweeps across instead of just appearing.
//
// Pills are a fixed size everywhere this renders — a narrow budget-table
// column and a wide account card both get the same PILL_WIDTH/GAP pills;
// what changes is how many of them fit, measured off the container's own
// rendered width, so a wider container reads as "more pills," never
// "fatter pills." This renders once per row (a budget/goals/accounts list
// can easily have 20-30 on one page), so the width tracking goes through
// lib/shared-width-observer — one ResizeObserver for every instance on the
// page instead of one each — rather than measuring here directly.
const PILL_WIDTH = 4;
const GAP = 4;
const MIN_SEGMENTS = 4;

export function SegmentedProgress({
  pct,
  overBudget,
  className = "",
  // Both default to the standard accent/negative-on-neutral-track look used
  // on a plain card; override them for a bar sitting on a photo or gradient
  // background, where that palette would be invisible or clash.
  color,
  trackColor = "var(--neutral-track)",
}: {
  pct: number;
  overBudget: boolean;
  className?: string;
  color?: string;
  trackColor?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [segmentCount, setSegmentCount] = useState(MIN_SEGMENTS);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    return observeWidth(el, (width) => {
      const fitted = Math.floor((width + GAP) / (PILL_WIDTH + GAP));
      const clampedCount = Math.max(MIN_SEGMENTS, fitted);
      setSegmentCount((current) => (current === clampedCount ? current : clampedCount));
    });
  }, []);

  const clamped = Math.min(100, Math.max(0, pct));
  const filledCount = Math.round((clamped / 100) * segmentCount);
  const fillColor = color ?? (overBudget ? "var(--negative)" : "var(--accent)");

  return (
    <div
      ref={containerRef}
      className={`flex h-3.5 w-full items-stretch gap-1 overflow-hidden ${className}`}
      role="img"
      aria-label={`${Math.round(clamped)}% of budget used`}
    >
      {Array.from({ length: segmentCount }, (_, i) => {
        const filled = i < filledCount;
        return (
          <div
            key={i}
            style={{
              width: PILL_WIDTH,
              backgroundColor: filled ? fillColor : trackColor,
              ...(filled ? { animationDelay: `${i * 45}ms` } : undefined),
            }}
            className={`shrink-0 rounded-full transition-colors duration-300 ${
              filled ? "animate-pill-fade" : ""
            }`}
          />
        );
      })}
    </div>
  );
}
