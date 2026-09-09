"use client";

import { useEffect, useRef, useState } from "react";

// A compact single-series line chart for secondary metrics (savings rate,
// net worth) that don't share a dollar scale with the main bar chart, so
// cramming them onto one set of axes would distort both. Fills its
// container's width (measured the same way Sparkline does) instead of a
// fixed pixel size, and shares the same hover crosshair + tooltip pattern
// as the Net Worth card's Sparkline for a consistent feel across every
// chart on this page.
const HEIGHT = 100;
const LEFT_PAD = 8;

export function SimpleLineChart({
  points,
  color,
  formatValue,
}: {
  points: { label: string; value: number }[];
  color: string;
  formatValue: (value: number) => string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(280);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

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

  if (points.length < 2) return null;

  const values = points.map((p) => p.value);
  const maxVal = Math.max(...values, 0);
  const minVal = Math.min(...values, 0);
  const domain = maxVal - minVal || 1;
  const labelHeight = 20;
  const totalHeight = HEIGHT + labelHeight;
  const step = (width - LEFT_PAD * 2) / (points.length - 1);

  const yFor = (value: number) => HEIGHT - ((value - minVal) / domain) * (HEIGHT - 8) - 4;
  const baselineY = yFor(0);

  const coords = points.map((p, i) => ({ x: LEFT_PAD + i * step, y: yFor(p.value) }));
  const linePath = coords
    .map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
    .join(" ");

  function handleMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = (e.clientX - rect.left) / rect.width;
    const index = Math.round(fraction * (points.length - 1));
    setHoverIndex(Math.min(points.length - 1, Math.max(0, index)));
  }

  const hovered = hoverIndex !== null ? coords[hoverIndex] : null;
  const hoveredPoint = hoverIndex !== null ? points[hoverIndex] : null;
  const leftPct = hovered ? (hovered.x / width) * 100 : 0;
  const topPct = hovered ? (hovered.y / totalHeight) * 100 : 0;

  return (
    <div ref={containerRef} className="relative w-full">
      <svg
        viewBox={`0 0 ${width} ${totalHeight}`}
        className="w-full cursor-crosshair"
        style={{ height: totalHeight }}
        onPointerMove={handleMove}
        onPointerLeave={() => setHoverIndex(null)}
      >
        {minVal < 0 && maxVal > 0 && (
          <line x1={0} y1={baselineY} x2={width} y2={baselineY} stroke="var(--border)" strokeWidth={1} />
        )}
        {hovered && (
          <line
            x1={hovered.x}
            y1={0}
            x2={hovered.x}
            y2={HEIGHT}
            stroke="var(--text-faint)"
            strokeWidth={1}
            strokeDasharray="2 2"
            opacity={0.5}
          />
        )}
        <path
          d={linePath}
          pathLength={1}
          className="animate-draw-line"
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {coords.map((c, i) => (
          <circle
            key={i}
            cx={c.x}
            cy={c.y}
            r={hoverIndex === i ? 4 : 2.5}
            fill={color}
            stroke={hoverIndex === i ? "var(--surface)" : "none"}
            strokeWidth={hoverIndex === i ? 1.5 : 0}
          />
        ))}
        {points.map((p, i) => (
          <text
            key={i}
            x={LEFT_PAD + i * step}
            y={HEIGHT + 14}
            textAnchor="middle"
            className="fill-text-faint"
            style={{ fontSize: 10 }}
          >
            {p.label}
          </text>
        ))}
      </svg>

      {hovered && hoveredPoint && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs whitespace-nowrap shadow-card"
          style={{
            left: `${leftPct}%`,
            top: `${topPct}%`,
            transform: "translate(-50%, calc(-100% - 10px))",
          }}
        >
          <p className="font-semibold text-text">{formatValue(hoveredPoint.value)}</p>
          <p className="text-text-faint">{hoveredPoint.label}</p>
        </div>
      )}
    </div>
  );
}
