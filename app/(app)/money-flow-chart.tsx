"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/format";
import type { MonthlyFlowPoint } from "@/lib/queries";
import { EmptyState } from "@/app/(app)/empty-state";

export function MoneyFlowChart({ points }: { points: MonthlyFlowPoint[] }) {
  const [hover, setHover] = useState<{
    point: MonthlyFlowPoint;
    kind: "income" | "expense";
  } | null>(null);

  if (points.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center">
        <EmptyState message="No history yet." />
      </div>
    );
  }

  const max = Math.max(1, ...points.flatMap((p) => [p.income, p.expense]));

  return (
    <div>
      <div className="relative flex h-64 items-end gap-3">
        {hover && (
          <div className="animate-fade-in-up pointer-events-none absolute -top-2 left-1/2 z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-[#101828] px-3 py-2 text-white shadow-modal">
            <p className="text-xs text-white/70">
              {hover.kind === "income" ? "Income" : "Expense"}
            </p>
            <p className="tabular text-sm font-semibold">
              {formatMoney(
                hover.kind === "income"
                  ? hover.point.income
                  : hover.point.expense,
              )}
            </p>
          </div>
        )}
        {points.map((p, i) => (
          <div
            key={p.periodId}
            className="flex flex-1 flex-col items-center gap-1"
          >
            <div className="flex h-52 w-full items-end justify-center gap-1">
              <div
                onMouseEnter={() => setHover({ point: p, kind: "income" })}
                onMouseLeave={() => setHover(null)}
                className="animate-bar-grow w-full max-w-[14px] rounded-t-sm bg-[color:var(--tile-1-bg)]"
                style={{
                  height: `${Math.max(2, (p.income / max) * 100)}%`,
                  animationDelay: `${i * 40}ms`,
                }}
              />
              <div
                onMouseEnter={() => setHover({ point: p, kind: "expense" })}
                onMouseLeave={() => setHover(null)}
                className="animate-bar-grow w-full max-w-[14px] rounded-t-sm bg-[color:var(--accent-bright)]"
                style={{
                  height: `${Math.max(2, (p.expense / max) * 100)}%`,
                  animationDelay: `${i * 40 + 20}ms`,
                }}
              />
            </div>
            <span className="text-xs text-text-faint">{p.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
