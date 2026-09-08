"use client";

import { useEffect, useRef, useState } from "react";
import { formatMoney, formatDate } from "@/lib/format";

type Point = { date: string; balance: number };

// Catmull-Rom -> cubic Bézier conversion, so the line curves smoothly through
// every point instead of the sharp zig-zag a plain polyline produces across
// many daily balance readings.
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return "";
  let d = `M ${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }
  return d;
}

export function Sparkline({ points, color }: { points: Point[]; color: string }) {
  const height = 64;
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  // The viewBox width tracks the container's actual rendered width, so the
  // SVG is never CSS-stretched to fill it — stretching a fixed-size viewBox
  // non-uniformly (preserveAspectRatio="none") scaled the stroke and the
  // curve's smoothing horizontally only, which is what read as "stretched."
  // Matching the two makes it a plain 1:1 pixel mapping.
  const [width, setWidth] = useState(280);

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

  const values = points.map((p) => p.balance);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = width / (points.length - 1);
  const coords = points.map((p, i) => ({
    x: i * step,
    y: height - ((p.balance - min) / range) * (height - 10) - 5,
  }));
  const linePath = smoothPath(coords);
  const last = coords[coords.length - 1];
  const first = coords[0];
  const areaPath = `${linePath} L ${last.x},${height} L ${first.x},${height} Z`;
  const gradientId = `sparkline-fill-${color.replace(/[^a-zA-Z0-9]/g, "")}`;

  // Maps the pointer's pixel position back to the nearest data point — the
  // viewBox width now matches the rendered width 1:1, so a fraction of the
  // rendered width maps directly onto the same fraction of the data.
  function handleMove(e: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const fraction = (e.clientX - rect.left) / rect.width;
    const index = Math.round(fraction * (points.length - 1));
    setHoverIndex(Math.min(points.length - 1, Math.max(0, index)));
  }

  const hovered = hoverIndex !== null ? coords[hoverIndex] : null;
  const hoveredPoint = hoverIndex !== null ? points[hoverIndex] : null;
  const leftPct = hovered ? (hovered.x / width) * 100 : 0;
  const topPct = hovered ? (hovered.y / height) * 100 : 0;

  return (
    <div ref={containerRef} className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-16 w-full cursor-crosshair overflow-visible"
        onPointerMove={handleMove}
        onPointerLeave={() => setHoverIndex(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.28} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
        <path
          d={linePath}
          pathLength={1}
          className="animate-draw-line"
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {hovered && (
          <line
            x1={hovered.x}
            y1={0}
            x2={hovered.x}
            y2={height}
            stroke={color}
            strokeWidth={1}
            strokeDasharray="2 2"
            opacity={0.35}
          />
        )}
        <circle cx={last.x} cy={last.y} r={3} fill={color} />
        {hovered && (
          <circle
            cx={hovered.x}
            cy={hovered.y}
            r={3.5}
            fill={color}
            stroke="var(--surface)"
            strokeWidth={1.5}
          />
        )}
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
          <p className="font-semibold text-text">
            {formatMoney(hoveredPoint.balance)}
          </p>
          <p className="text-text-faint">{formatDate(hoveredPoint.date)}</p>
        </div>
      )}
    </div>
  );
}
