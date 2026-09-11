"use client";

import { useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/format";

const HEIGHT = 190;
const PAD_TOP = 14;
const PAD_BOTTOM = 22;
const PAD_X = 8;

// Running total of this month's spending, day by day, against last month's
// running total (dashed) and the month's total budget (flat dashed line), so
// it's obvious at a glance whether spending is ahead of its usual pace.
export function SpendPaceChart({
  current,
  previous,
  daysInMonth,
  budget,
  previousLabel,
}: {
  // Cumulative spend per day, index 0 = day 1, up to today.
  current: number[];
  // Cumulative spend per day for the whole previous month.
  previous: number[];
  daysInMonth: number;
  budget: number | null;
  previousLabel: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hoverDay, setHoverDay] = useState<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const prev = previous.slice(0, daysInMonth);
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const maxValue = Math.max(budget ?? 0, ...current, ...prev, 1) * 1.08;
  const x = (dayIndex: number) =>
    PAD_X + (daysInMonth <= 1 ? 0 : (dayIndex / (daysInMonth - 1)) * (width - PAD_X * 2));
  const y = (value: number) => PAD_TOP + plotHeight - (value / maxValue) * plotHeight;
  const pathFor = (series: number[]) =>
    series.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");

  const lastIndex = current.length - 1;
  const ticks = [0, 7, 14, 21, 28].filter((i) => i < daysInMonth);

  function handleMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = (e.clientX - rect.left - PAD_X) / Math.max(1, rect.width - PAD_X * 2);
    const day = Math.round(fraction * (daysInMonth - 1));
    setHoverDay(Math.min(daysInMonth - 1, Math.max(0, day)));
  }

  const hoverCurrent = hoverDay !== null && hoverDay <= lastIndex ? current[hoverDay] : null;
  const hoverPrevious = hoverDay !== null && hoverDay < prev.length ? prev[hoverDay] : null;
  const tooltipLeft = hoverDay !== null ? Math.min(Math.max(0, x(hoverDay) - 70), Math.max(0, width - 160)) : 0;

  return (
    <div ref={containerRef} className="relative w-full">
      <svg
        width={width}
        height={HEIGHT}
        className="block touch-none"
        onPointerMove={handleMove}
        onPointerLeave={() => setHoverDay(null)}
        role="img"
        aria-label="Running total of this month's spending compared with last month and the budget"
      >
        {budget ? (
          <>
            <line
              x1={PAD_X}
              x2={width - PAD_X}
              y1={y(budget)}
              y2={y(budget)}
              stroke="var(--border)"
              strokeWidth={1.5}
              strokeDasharray="4 4"
            />
            <text x={PAD_X} y={y(budget) - 6} className="fill-[var(--text-faint)] text-[11px]">
              {formatMoney(budget)} budget
            </text>
          </>
        ) : null}
        {prev.length > 1 && (
          <path
            d={pathFor(prev)}
            fill="none"
            stroke="var(--text-faint)"
            strokeWidth={1.5}
            strokeDasharray="4 4"
          />
        )}
        {current.length > 1 && (
          <path
            d={pathFor(current)}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={2.25}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {lastIndex >= 0 && (
          <circle
            cx={x(lastIndex)}
            cy={y(current[lastIndex])}
            r={4}
            fill="var(--accent)"
            stroke="var(--surface)"
            strokeWidth={2}
          />
        )}
        {hoverDay !== null && (
          <line
            x1={x(hoverDay)}
            x2={x(hoverDay)}
            y1={PAD_TOP}
            y2={PAD_TOP + plotHeight}
            stroke="var(--border)"
          />
        )}
        {ticks.map((i) => (
          <text
            key={i}
            x={x(i)}
            y={HEIGHT - 4}
            textAnchor={i === 0 ? "start" : "middle"}
            className="fill-[var(--text-faint)] text-[11px]"
          >
            {String(i + 1).padStart(2, "0")}
          </text>
        ))}
      </svg>
      {hoverDay !== null && (hoverCurrent !== null || hoverPrevious !== null) && (
        <div
          className="pointer-events-none absolute top-0 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs shadow-card"
          style={{ left: tooltipLeft }}
        >
          <p className="text-text-faint">Day {hoverDay + 1}</p>
          {hoverCurrent !== null && (
            <p className="tabular font-medium text-text">{formatMoney(hoverCurrent)} this month</p>
          )}
          {hoverPrevious !== null && previousLabel && (
            <p className="tabular text-text-muted">
              {formatMoney(hoverPrevious)} in {previousLabel}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
