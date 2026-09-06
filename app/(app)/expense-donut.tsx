"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/format";
import { getCategoryIcon } from "@/lib/category-icons";

type SegmentTransaction = {
  id: string;
  description: string;
  amount: number;
  txn_date: string;
};

export type DonutSegment = {
  name: string;
  actual: number;
  color: string;
  transactions: SegmentTransaction[];
};

const SIZE = 200;
const CENTER = SIZE / 2;
const RADIUS = 80;
const STROKE = 32;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

type Arc = DonutSegment & { pct: number; segLen: number; offset: number };

export function ExpenseDonutChart({ segments }: { segments: DonutSegment[] }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<Arc | null>(null);

  const totalSpend = segments.reduce((sum, s) => sum + s.actual, 0);

  const arcs = segments.reduce<Arc[]>((acc, s) => {
    const cumulative = acc.reduce((sum, a) => sum + a.pct, 0);
    const pct = totalSpend > 0 ? (s.actual / totalSpend) * 100 : 0;
    const segLen = (pct / 100) * CIRCUMFERENCE;
    const offset = (cumulative / 100) * CIRCUMFERENCE;
    acc.push({ ...s, pct, segLen, offset });
    return acc;
  }, []);

  const hoveredArc = arcs.find((a) => a.name === hovered) ?? null;

  return (
    <>
      <div className="relative size-[200px] shrink-0">
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="-rotate-90"
        >
          {arcs.map((a) => (
            <circle
              key={a.name}
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              fill="none"
              stroke={a.color}
              strokeWidth={STROKE}
              strokeDasharray={`${a.segLen} ${CIRCUMFERENCE - a.segLen}`}
              strokeDashoffset={-a.offset}
              className="cursor-pointer transition-opacity"
              style={{
                opacity: hovered && hovered !== a.name ? 0.35 : 1,
              }}
              onMouseEnter={() => setHovered(a.name)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => setSelected(a)}
            >
              <title>{`${a.name}: ${formatMoney(a.actual)} (${a.pct.toFixed(1)}%)`}</title>
            </circle>
          ))}
        </svg>
        <div className="absolute inset-[18%] flex flex-col items-center justify-center rounded-full bg-surface text-center">
          {hoveredArc ? (
            <>
              <p className="truncate px-2 text-xs text-text-muted">{hoveredArc.name}</p>
              <p className="text-lg font-semibold text-text">
                {hoveredArc.pct.toFixed(1)}%
              </p>
            </>
          ) : (
            <>
              <p className="text-xs text-text-muted">Total</p>
              <p className="text-lg font-semibold text-text">{formatMoney(totalSpend)}</p>
            </>
          )}
        </div>
      </div>

      <div className="flex w-full flex-col">
        {arcs.map((a) => (
          <button
            key={a.name}
            type="button"
            onMouseEnter={() => setHovered(a.name)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => setSelected(a)}
            className="flex items-center gap-2 border-b border-border px-2 py-3 text-left last:border-b-0 hover:bg-bg"
          >
            <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: a.color }} />
            <span className="flex flex-1 items-center gap-1.5 truncate text-[15px] text-text">
              <span className="shrink-0">{getCategoryIcon(a.name)}</span>
              <span className="truncate">{a.name}</span>
            </span>
            <span className="tabular text-[15px] text-text-faint">{a.pct.toFixed(1)}%</span>
          </button>
        ))}
      </div>

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setSelected(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-xl"
          >
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-text">
                  {getCategoryIcon(selected.name)} {selected.name}
                </h2>
                <p className="text-sm text-text-muted">
                  {formatMoney(selected.actual)} · {selected.pct.toFixed(1)}% of spend
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="text-text-faint hover:text-text"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="max-h-[360px] overflow-y-auto">
              {selected.transactions.length === 0 ? (
                <p className="py-6 text-center text-sm text-text-muted">
                  No transactions found.
                </p>
              ) : (
                <div className="divide-y divide-border">
                  {selected.transactions.map((t) => (
                    <div key={t.id} className="flex items-center justify-between py-2.5">
                      <div>
                        <p className="text-sm font-medium text-text">{t.description}</p>
                        <p className="text-xs text-text-faint">{t.txn_date}</p>
                      </div>
                      <p className="tabular text-sm font-medium text-text">
                        {formatMoney(t.amount)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
