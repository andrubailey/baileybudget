"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/format";
import type { NetWorthPoint } from "@/lib/queries";

const WIDTH = 640;
const HEIGHT = 200;
const PADDING = 24;

export function NetWorthChart({ points }: { points: NetWorthPoint[] }) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (points.length < 2) {
    return (
      <p className="text-sm text-text-muted">
        Log a couple more months of transactions to see your net worth trend.
      </p>
    );
  }

  const values = points.map((p) => p.netWorth);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const span = max - min || 1;

  const xFor = (i: number) =>
    PADDING + (i / (points.length - 1)) * (WIDTH - PADDING * 2);
  const yFor = (v: number) =>
    HEIGHT - PADDING - ((v - min) / span) * (HEIGHT - PADDING * 2);

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(i)} ${yFor(p.netWorth)}`)
    .join(" ");
  const areaPath = `${linePath} L ${xFor(points.length - 1)} ${HEIGHT - PADDING} L ${xFor(0)} ${HEIGHT - PADDING} Z`;

  const latest = points[points.length - 1];
  const first = points[0];
  const change = latest.netWorth - first.netWorth;

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <p className="tabular text-2xl font-semibold text-text">{formatMoney(latest.netWorth)}</p>
        <p className={`tabular text-sm font-medium ${change >= 0 ? "text-success" : "text-[#f04438]"}`}>
          {change >= 0 ? "+" : ""}
          {formatMoney(change)} since {first.periodName}
        </p>
      </div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        onMouseLeave={() => setHovered(null)}
      >
        <path d={areaPath} fill="var(--accent-soft)" opacity={0.5} />
        <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth={2} />
        {points.map((p, i) => (
          <g key={p.periodId}>
            <circle
              cx={xFor(i)}
              cy={yFor(p.netWorth)}
              r={hovered === i ? 5 : 3}
              fill="var(--accent)"
              onMouseEnter={() => setHovered(i)}
            />
            <rect
              x={xFor(i) - (WIDTH / points.length) / 2}
              y={0}
              width={WIDTH / points.length}
              height={HEIGHT}
              fill="transparent"
              onMouseEnter={() => setHovered(i)}
            />
          </g>
        ))}
      </svg>
      <div className="flex justify-between text-xs text-text-faint">
        <span>{first.periodName}</span>
        <span>{latest.periodName}</span>
      </div>
      {hovered !== null && (
        <p className="mt-1 text-center text-xs text-text-muted">
          {points[hovered].periodName}: {formatMoney(points[hovered].netWorth)}
        </p>
      )}
    </div>
  );
}
