"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/format";

export type CashFlowPoint = {
  key: string;
  label: string;
  up: number;
  down: number;
  line: number;
  href: string | null;
};

function niceCeil(value: number): number {
  if (value <= 0) return 0;
  const power = 10 ** Math.floor(Math.log10(value));
  const n = value / power;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * power;
}

function compactMoney(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1000) {
    const k = abs / 1000;
    return `${sign}$${k >= 10 ? Math.round(k) : Number(k.toFixed(1))}K`;
  }
  return `${sign}$${Math.round(abs)}`;
}

function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return "";
  let d = `M ${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    d += ` C ${p1.x + (p2.x - p0.x) / 6},${p1.y + (p2.y - p0.y) / 6} ${p2.x - (p3.x - p1.x) / 6},${p2.y - (p3.y - p1.y) / 6} ${p2.x},${p2.y}`;
  }
  return d;
}

const PLOT_HEIGHT = "h-56 sm:h-64";

// Sized entirely with percentages, no width measurement: bars are HTML
// columns, the dashed trend line is a stretched SVG with a non-scaling
// stroke, and the dots are positioned divs so they stay round.
export function CashFlowChart({
  points,
  mode,
}: {
  points: CashFlowPoint[];
  mode: "split" | "single";
}) {
  const router = useRouter();
  const [active, setActive] = useState<number | null>(null);

  if (points.length === 0) return null;

  const top = niceCeil(Math.max(0, ...points.map((p) => Math.max(p.up, p.line))));
  const bottom = niceCeil(Math.max(0, ...points.map((p) => Math.max(p.down, -p.line))));
  const max = top === 0 && bottom === 0 ? 1 : top;
  const min = -bottom;
  const span = max - min;
  const y = (v: number) => ((max - v) / span) * 100;
  const x = (i: number) => ((i + 0.5) / points.length) * 100;
  const ticks = Array.from({ length: 5 }, (_, i) => max - (span * i) / 4);
  const linePoints = points.map((p, i) => ({ x: x(i), y: y(p.line) }));
  const activePoint = active === null ? null : points[active];
  const upColor = mode === "split" ? "var(--accent-bright)" : "var(--accent)";

  function handleColumnClick(i: number) {
    const href = points[i].href;
    if (active === i && href) router.push(href);
    else setActive(i);
  }

  return (
    <div className="mt-6">
      {mode === "split" && (
        <div className="mb-4 flex flex-wrap items-center gap-4 text-xs text-text-muted">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ backgroundColor: "var(--accent-bright)" }} />
            Income
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ backgroundColor: "var(--accent)" }} />
            Expenses
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 border-t-2 border-dashed" style={{ borderColor: "var(--text)" }} />
            Net cash flow
          </span>
        </div>
      )}

      <div className="flex gap-3">
        <div
          className={`relative flex-1 ${PLOT_HEIGHT}`}
          onMouseLeave={() => setActive(null)}
        >
          {ticks.map((t) => (
            <div
              key={t}
              className="absolute inset-x-0 border-t border-dashed border-border"
              style={{ top: `${y(t)}%` }}
            />
          ))}
          <div
            className="absolute inset-x-0"
            style={{ top: `${y(0)}%`, borderTop: "1px solid var(--text-faint)", opacity: 0.35 }}
          />

          <div className="absolute inset-0 flex">
            {points.map((p, i) => (
              <div
                key={p.key}
                className={`relative flex-1 ${p.href ? "cursor-pointer" : ""}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => handleColumnClick(i)}
              >
                {active === i && <div className="absolute inset-y-0 inset-x-1 rounded-md bg-bg" />}
                {p.up > 0 && (
                  <div
                    className="animate-bar-grow absolute left-1/2 w-[38%] max-w-8 -translate-x-1/2 rounded-t-[3px]"
                    style={{
                      top: `${y(p.up)}%`,
                      height: `${y(0) - y(p.up)}%`,
                      backgroundColor: upColor,
                      animationDelay: `${i * 50}ms`,
                    }}
                  />
                )}
                {p.down > 0 && (
                  <div
                    className="animate-bar-grow-top absolute left-1/2 w-[38%] max-w-8 -translate-x-1/2 rounded-b-[3px]"
                    style={{
                      top: `${y(0)}%`,
                      height: `${y(-p.down) - y(0)}%`,
                      backgroundColor: "var(--accent)",
                      animationDelay: `${i * 50}ms`,
                    }}
                  />
                )}
              </div>
            ))}
          </div>

          <svg
            className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path
              d={smoothPath(linePoints)}
              fill="none"
              stroke="var(--text)"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {linePoints.map((pt, i) => (
            <span
              key={points[i].key}
              className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface"
              style={{ left: `${pt.x}%`, top: `${pt.y}%`, backgroundColor: "var(--text)" }}
            />
          ))}

          {activePoint && active !== null && (
            <div
              className={`pointer-events-none absolute top-0 z-10 rounded-lg border border-border bg-surface px-3 py-2 text-xs whitespace-nowrap shadow-card ${
                x(active) < 20 ? "" : x(active) > 80 ? "-translate-x-full" : "-translate-x-1/2"
              }`}
              style={{ left: `${x(active)}%` }}
            >
              <p className="font-semibold text-text">{activePoint.label}</p>
              {mode === "split" ? (
                <div className="mt-1 space-y-0.5 text-text-muted">
                  <p className="tabular">Income {formatMoney(activePoint.up)}</p>
                  <p className="tabular">Expenses {formatMoney(activePoint.down)}</p>
                  <p className="tabular font-medium text-text">
                    Net {activePoint.line < 0 ? "-" : ""}
                    {formatMoney(Math.abs(activePoint.line))}
                  </p>
                </div>
              ) : (
                <p className="tabular mt-1 text-text">{formatMoney(activePoint.line)}</p>
              )}
              {activePoint.href && <p className="mt-1 text-text-faint">Click again to view</p>}
            </div>
          )}
        </div>

        <div className={`relative w-12 shrink-0 ${PLOT_HEIGHT}`} aria-hidden="true">
          {ticks.map((t) => (
            <span
              key={t}
              className="tabular absolute right-0 -translate-y-1/2 text-[11px] text-text-faint"
              style={{ top: `${y(t)}%` }}
            >
              {compactMoney(t)}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-3 flex pr-15">
        {points.map((p) => (
          <span key={p.key} className="flex-1 text-center text-xs text-text-faint">
            {p.label}
          </span>
        ))}
      </div>
    </div>
  );
}
