"use client";

import { useState, useTransition } from "react";
import { reorderAccounts } from "@/app/actions";
import { formatMoney, progressColor } from "@/lib/format";
import type { AccountWithBalance } from "@/lib/queries";
import { BankLogo } from "@/app/(app)/accounts/bank-logo";

export function DashboardAccountList({
  accounts,
  periodDeltaByAccount,
}: {
  accounts: AccountWithBalance[];
  periodDeltaByAccount?: Map<string, number>;
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

  // Touch screens can't drag-reorder easily, so up/down buttons are the
  // accessible/mobile fallback for the same reorder action.
  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next);
    startTransition(() => {
      reorderAccounts(next.map((a) => a.id));
    });
  }

  if (order.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      {order.map((a, index) => {
        const goalPct =
          !a.is_debt && a.goal && a.goal > 0
            ? Math.min(100, Math.max(0, (a.balance / a.goal) * 100))
            : null;
        // Debt payoff progress: how much of the gap between the starting
        // balance and the goal (usually 0) has been paid down so far.
        const payoffSpan = a.starting_balance - (a.goal ?? 0);
        const payoffPct =
          a.is_debt && payoffSpan !== 0
            ? Math.min(100, Math.max(0, ((a.starting_balance - a.balance) / payoffSpan) * 100))
            : null;
        const delta = periodDeltaByAccount?.get(a.id) ?? 0;
        // For debt, a shrinking balance is the good direction, so the
        // trend color is the opposite of a regular account's.
        const deltaIsGood = a.is_debt ? delta < 0 : delta > 0;
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
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-text-muted">{a.name}</p>
                {a.bank && <BankLogo bank={a.bank} />}
                {a.is_debt && (
                  <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] font-semibold text-text-faint">
                    Debt
                  </span>
                )}
              </div>
              <div className="flex shrink-0 gap-0.5">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label={`Move ${a.name} up`}
                  className="rounded p-0.5 text-text-faint hover:bg-bg disabled:opacity-30"
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === order.length - 1}
                  aria-label={`Move ${a.name} down`}
                  className="rounded p-0.5 text-text-faint hover:bg-bg disabled:opacity-30"
                >
                  ▼
                </button>
              </div>
            </div>
            <p className="tabular mt-1 text-xl font-semibold text-text">
              {formatMoney(a.balance)}
            </p>
            {periodDeltaByAccount && delta !== 0 && (
              <p
                className={`tabular text-xs font-medium ${deltaIsGood ? "text-success" : "text-[#f04438]"}`}
              >
                {delta > 0 ? "+" : ""}
                {formatMoney(delta)} this period
              </p>
            )}
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
            {payoffPct !== null && (
              <div className="mt-3">
                <div className="tabular flex justify-between text-xs text-text-faint">
                  <span>{formatMoney(a.balance)} owed</span>
                  <span>{payoffPct.toFixed(0)}% paid off</span>
                </div>
                <div className="mt-1 h-1.5 w-full rounded-full bg-bg">
                  <div className="h-1.5 rounded-full bg-success" style={{ width: `${payoffPct}%` }} />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
