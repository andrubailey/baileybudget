"use client";

import { useState, useTransition } from "react";
import { reorderAccounts } from "@/app/actions";
import { formatMoney, progressColor } from "@/lib/format";
import type { AccountWithBalance } from "@/lib/queries";

export function DashboardAccountList({
  accounts,
}: {
  accounts: AccountWithBalance[];
}) {
  const [order, setOrder] = useState(accounts);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handleDragOver(e: React.DragEvent, overId: string) {
    e.preventDefault();
    if (!draggedId || draggedId === overId) return;

    setOrder((current) => {
      const fromIndex = current.findIndex((a) => a.id === draggedId);
      const toIndex = current.findIndex((a) => a.id === overId);
      if (fromIndex === -1 || toIndex === -1) return current;
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }

  function handleDrop() {
    setDraggedId(null);
    startTransition(() => {
      reorderAccounts(order.map((a) => a.id));
    });
  }

  if (order.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {order.map((a) => {
        const goalPct =
          a.goal && a.goal > 0
            ? Math.min(100, Math.max(0, (a.balance / a.goal) * 100))
            : null;
        return (
          <div
            key={a.id}
            draggable
            onDragStart={() => setDraggedId(a.id)}
            onDragOver={(e) => handleDragOver(e, a.id)}
            onDrop={handleDrop}
            onDragEnd={handleDrop}
            className={`cursor-grab rounded-xl border border-border bg-surface p-5 shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] active:cursor-grabbing ${
              draggedId === a.id ? "opacity-50" : ""
            }`}
          >
            <p className="text-sm font-medium text-text-muted">{a.name}</p>
            <p className="tabular mt-1 text-xl font-semibold text-text">
              {formatMoney(a.balance)}
            </p>
            {goalPct !== null && (
              <div className="mt-3">
                <div className="tabular flex justify-between text-xs text-text-faint">
                  <span>
                    {formatMoney(a.balance)} / {formatMoney(a.goal!)}
                  </span>
                  <span>{goalPct.toFixed(0)}%</span>
                </div>
                <div className="mt-1 h-1.5 w-full rounded-full bg-bg">
                  <div
                    className="h-1.5 rounded-full"
                    style={{ width: `${goalPct}%`, backgroundColor: progressColor(goalPct) }}
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
