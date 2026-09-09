"use client";

import { useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/format";
import type { MonthlyTotal } from "@/lib/queries";

const HEIGHT = 260;
const BAR_WIDTH = 20;
const LEFT_PAD = 8;
const TOP_PAD = 24;

export type ChartPoint = MonthlyTotal & {
  label: string;
  isCurrent?: boolean;
  expenseSplit?: { recurring: number; other: number } | null;
  planned?: number | null;
  objectiveNames?: string[];
  isAnomaly?: boolean;
};

// Bars (income/expense) and the net trend line all share one Y scale, so
// the line reads as "the gap between the two bars" rather than a
// disconnected overlay. Always measures its own container (same technique
// as Sparkline) and spaces bars to fill it exactly — never a fixed pixel
// width with a horizontal scrollbar. `compact` (used for the multi-year
// small-multiples, three to a row) just shrinks the chart height and drops
// the axis/legend chrome; it still fills whatever width it's given.
export function MonthlyTrendChart({
  data,
  prevYearData,
  rollingAvg,
  showGhost = false,
  showRollingAvg = false,
  showObjectives = true,
  showBudgetLine = false,
  showRecurringSplit = false,
  compact = false,
  showAxisLabels = true,
  showLegend = true,
}: {
  data: ChartPoint[];
  prevYearData?: (MonthlyTotal | null)[];
  rollingAvg?: (number | null)[];
  showGhost?: boolean;
  showRollingAvg?: boolean;
  showObjectives?: boolean;
  showBudgetLine?: boolean;
  showRecurringSplit?: boolean;
  compact?: boolean;
  showAxisLabels?: boolean;
  showLegend?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(640);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setContainerWidth(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (data.length === 0) return null;

  const nets = data.map((d) => d.income - d.expense);
  const rollingVals = (rollingAvg ?? []).filter((v): v is number => v !== null);
  const prevVals = (prevYearData ?? []).filter((d): d is MonthlyTotal => d !== null);
  const plannedVals = data.map((d) => d.planned ?? 0);
  const maxVal = Math.max(
    ...data.flatMap((d) => [d.income, d.expense]),
    ...prevVals.flatMap((d) => [d.income, d.expense]),
    ...plannedVals,
    1,
  );
  const minVal = Math.min(0, ...nets, ...rollingVals);
  const domain = maxVal - minVal || 1;
  const width = containerWidth;
  const effectiveGroupWidth = Math.max(12, (width - LEFT_PAD * 2) / data.length);
  const barWidth = Math.min(BAR_WIDTH, effectiveGroupWidth / 3.2);
  const chartHeight = compact ? 100 : HEIGHT;
  const topPad = showObjectives ? TOP_PAD : 4;
  const bottomPad = showAxisLabels ? 28 : 4;
  const totalHeight = topPad + chartHeight + bottomPad;

  const yFor = (value: number) => topPad + chartHeight - ((value - minVal) / domain) * chartHeight;
  const baselineY = yFor(0);

  const groupXFor = (i: number) => LEFT_PAD + i * effectiveGroupWidth + effectiveGroupWidth / 2;

  const netPoints = data.map((d, i) => ({
    x: groupXFor(i),
    y: yFor(d.income - d.expense),
  }));
  const linePath = netPoints
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");

  const avgSegments: string[] = [];
  let currentSegment: string | null = null;
  (rollingAvg ?? []).forEach((v, i) => {
    const x = groupXFor(i);
    if (v === null || !showRollingAvg) {
      currentSegment = null;
      return;
    }
    const y = yFor(v);
    if (currentSegment === null) {
      currentSegment = `M${x.toFixed(1)},${y.toFixed(1)}`;
      avgSegments.push(currentSegment);
    } else {
      avgSegments[avgSegments.length - 1] += ` L${x.toFixed(1)},${y.toFixed(1)}`;
    }
  });

  // Same crosshair + floating tooltip pattern as the Net Worth card's
  // Sparkline — hovering anywhere over the chart snaps to the nearest
  // month's bars instead of relying on the browser's native (slow,
  // inconsistent) title tooltip.
  function handleMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = (e.clientX - rect.left) / rect.width;
    const px = fraction * width;
    const index = Math.round((px - LEFT_PAD - effectiveGroupWidth / 2) / effectiveGroupWidth);
    setHoverIndex(Math.min(data.length - 1, Math.max(0, index)));
  }

  const hovered = hoverIndex !== null ? data[hoverIndex] : null;
  const hoveredX = hoverIndex !== null ? groupXFor(hoverIndex) : null;
  const hoveredNetY = hoverIndex !== null ? netPoints[hoverIndex].y : null;
  const leftPct = hoveredX !== null ? (hoveredX / width) * 100 : 0;
  const topPct = hoveredNetY !== null ? (hoveredNetY / totalHeight) * 100 : 0;

  return (
    <div ref={containerRef} className="w-full">
      <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${totalHeight}`}
        width={width}
        height={totalHeight}
        className="w-full cursor-crosshair"
        style={{ height: totalHeight }}
        onPointerMove={handleMove}
        onPointerLeave={() => setHoverIndex(null)}
      >
        <line x1={0} y1={baselineY} x2={width} y2={baselineY} stroke="var(--border)" strokeWidth={1} />

        {hoveredX !== null && (
          <line
            x1={hoveredX}
            y1={topPad}
            x2={hoveredX}
            y2={topPad + chartHeight}
            stroke="var(--text-faint)"
            strokeWidth={1}
            strokeDasharray="2 2"
            opacity={0.5}
          />
        )}

        {data.map((d, i) => {
          const groupX = groupXFor(i);
          const incomeY = yFor(d.income);
          const expenseY = yFor(d.expense);
          const prev = prevYearData?.[i];
          const split = showRecurringSplit ? d.expenseSplit : null;
          const recurringY = split ? yFor(split.recurring) : null;
          const isHovered = hoverIndex === i;

          return (
            <g key={d.month + i} opacity={hoverIndex !== null && !isHovered ? 0.45 : 1}>
              {showGhost && prev && (
                <>
                  <rect
                    x={groupX - barWidth - 2}
                    y={Math.min(yFor(prev.income), baselineY)}
                    width={barWidth}
                    height={Math.abs(baselineY - yFor(prev.income))}
                    rx={3}
                    fill="none"
                    stroke="var(--accent)"
                    strokeOpacity={0.4}
                    strokeDasharray="2 2"
                  />
                  <rect
                    x={groupX + 2}
                    y={Math.min(yFor(prev.expense), baselineY)}
                    width={barWidth}
                    height={Math.abs(baselineY - yFor(prev.expense))}
                    rx={3}
                    fill="none"
                    stroke="var(--negative)"
                    strokeOpacity={0.4}
                    strokeDasharray="2 2"
                  />
                </>
              )}

              <rect
                x={groupX - barWidth - 2}
                y={Math.min(incomeY, baselineY)}
                width={barWidth}
                height={Math.abs(baselineY - incomeY)}
                rx={3}
                fill="var(--accent)"
                fillOpacity={d.isCurrent ? 0.5 : 1}
                className="animate-bar-grow"
                style={{ animationDelay: `${i * 30}ms` }}
              />

              {split && recurringY !== null ? (
                <>
                  <rect
                    x={groupX + 2}
                    y={Math.min(recurringY, baselineY)}
                    width={barWidth}
                    height={Math.abs(baselineY - recurringY)}
                    rx={3}
                    fill="var(--negative)"
                    fillOpacity={d.isCurrent ? 0.35 : 0.75}
                    className="animate-bar-grow-top"
                    style={{ animationDelay: `${i * 30}ms` }}
                  />
                  <rect
                    x={groupX + 2}
                    y={Math.min(expenseY, recurringY)}
                    width={barWidth}
                    height={Math.abs(recurringY - expenseY)}
                    fill="var(--negative)"
                    fillOpacity={d.isCurrent ? 0.2 : 0.4}
                    className="animate-bar-grow-top"
                    style={{ animationDelay: `${i * 30}ms` }}
                  />
                </>
              ) : (
                <rect
                  x={groupX + 2}
                  y={Math.min(expenseY, baselineY)}
                  width={barWidth}
                  height={Math.abs(baselineY - expenseY)}
                  rx={3}
                  fill="var(--negative)"
                  fillOpacity={d.isCurrent ? 0.4 : 0.75}
                  className="animate-bar-grow-top"
                  style={{ animationDelay: `${i * 30}ms` }}
                />
              )}

              {showBudgetLine && d.planned != null && d.planned > 0 && (
                <line
                  x1={groupX + 1}
                  x2={groupX + 3 + barWidth}
                  y1={yFor(d.planned)}
                  y2={yFor(d.planned)}
                  stroke="var(--text)"
                  strokeWidth={2}
                  strokeDasharray="1 3"
                  strokeLinecap="round"
                />
              )}

              {d.isAnomaly && (
                <text x={groupX + 2 + barWidth / 2} y={Math.min(expenseY, baselineY) - 6} textAnchor="middle" style={{ fontSize: 12 }}>
                  <title>{`${d.label}: unusually high spending`}</title>
                  ⚠
                </text>
              )}

              {showObjectives && d.objectiveNames && d.objectiveNames.length > 0 && (
                <text x={groupX} y={topPad - 10} textAnchor="middle" style={{ fontSize: 13 }}>
                  <title>{`Goal due: ${d.objectiveNames.join(", ")}`}</title>
                  🎯
                </text>
              )}

              {showAxisLabels && (
                <text
                  x={groupX}
                  y={topPad + chartHeight + 20}
                  textAnchor="middle"
                  className="fill-text-faint"
                  style={{ fontSize: 11 }}
                >
                  {d.label}
                  {d.isCurrent ? "*" : ""}
                </text>
              )}
            </g>
          );
        })}

        <path
          d={linePath}
          pathLength={1}
          className="animate-draw-line"
          fill="none"
          stroke="var(--projected)"
          strokeWidth={2}
          strokeLinejoin="round"
        />
        {netPoints.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={hoverIndex === i ? 4 : 3}
            fill="var(--projected)"
            stroke={hoverIndex === i ? "var(--surface)" : "none"}
            strokeWidth={hoverIndex === i ? 1.5 : 0}
          />
        ))}

        {avgSegments.map((d, i) => (
          <path
            key={i}
            d={d}
            fill="none"
            stroke="var(--text-faint)"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            strokeLinejoin="round"
          />
        ))}
      </svg>

      {hovered && hoveredX !== null && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border border-border bg-surface px-3 py-2 text-xs whitespace-nowrap shadow-card"
          style={{
            left: `${leftPct}%`,
            top: `${topPct}%`,
            transform: "translate(-50%, calc(-100% - 12px))",
          }}
        >
          <p className="font-semibold text-text">
            {hovered.label}
            {hovered.isCurrent ? " (in progress)" : ""}
          </p>
          <p className="mt-1 text-accent">
            <span className="font-medium">{formatMoney(hovered.income)}</span> income
          </p>
          <p className="text-negative">
            <span className="font-medium">{formatMoney(hovered.expense)}</span> expenses
          </p>
          <p className="text-text-faint">
            Net{" "}
            <span className="font-medium text-text">
              {formatMoney(hovered.income - hovered.expense)}
            </span>
          </p>
        </div>
      )}
      </div>

      {showLegend && (
        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-text-muted">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-accent" /> Income
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-negative opacity-75" /> Expenses
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-projected" /> Net trend
          </span>
          {showRollingAvg && (
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-3 bg-text-faint" /> 3-mo avg net
            </span>
          )}
          {showGhost && prevYearData && (
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full border border-dashed border-accent" /> Last year
            </span>
          )}
          {showBudgetLine && (
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-3 bg-text" /> Planned
            </span>
          )}
          {data.some((d) => d.isCurrent) && <span className="text-text-faint">* in progress</span>}
        </div>
      )}
    </div>
  );
}
