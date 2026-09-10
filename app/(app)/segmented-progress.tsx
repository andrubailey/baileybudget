"use client";

import { useLayoutEffect, useRef, useState } from "react";

// A row of thin vertical pills instead of one continuous bar — each segment
// represents an even slice of 100%, filling left to right as spend catches
// up to plan. Each filled pill grows in with its own stagger, so the fill
// visibly sweeps across instead of just appearing.
//
// Pills are a fixed size everywhere this renders — a narrow budget-table
// column and a wide account card both get the same PILL_WIDTH/GAP pills;
// what changes is how many of them fit, measured off the container's own
// rendered width, so a wider container reads as "more pills," never
// "fatter pills."
const PILL_WIDTH = 4;
const GAP = 3;
const MIN_SEGMENTS = 4;

export function SegmentedProgress({
  pct,
  overBudget,
  className = "",
  // Both default to the standard accent/negative-on-neutral-track look used
  // everywhere this renders on a plain card. goal-banner.tsx is the one
  // exception — it sits on top of a photo/gradient hero background, where
  // that palette would be invisible or clash, so it overrides both to a
  // white-on-glass treatment instead.
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

    function computeCount() {
      const width = el!.getBoundingClientRect().width;
      const fitted = Math.floor((width + GAP) / (PILL_WIDTH + GAP));
      setSegmentCount(Math.max(MIN_SEGMENTS, fitted));
    }

    computeCount();
    const observer = new ResizeObserver(computeCount);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const clamped = Math.min(100, Math.max(0, pct));
  const filledCount = Math.round((clamped / 100) * segmentCount);
  const fillColor = color ?? (overBudget ? "var(--negative)" : "var(--accent)");

  return (
    <div
      ref={containerRef}
      className={`flex h-3.5 w-full items-stretch gap-[3px] overflow-hidden ${className}`}
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
              filled ? "animate-bar-grow" : ""
            }`}
          />
        );
      })}
    </div>
  );
}
