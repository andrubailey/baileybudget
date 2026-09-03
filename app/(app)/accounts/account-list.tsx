"use client";

import { useState, useTransition } from "react";
import {
  toggleAccountActive,
  updateAccountBank,
  updateAccountGoal,
  reorderAccounts,
} from "@/app/actions";
import { formatMoney } from "@/lib/format";
import type { AccountWithBalance } from "@/lib/queries";

const BANK_BADGE_CLASSES: Record<string, string> = {
  Chase: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  "CIT Bank": "bg-slate-100 text-slate-800 dark:bg-slate-800/60 dark:text-slate-300",
  Amex: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300",
};

function bankBadgeClass(bank: string) {
  return (
    BANK_BADGE_CLASSES[bank] ??
    "bg-black/10 text-black/60 dark:bg-white/10 dark:text-white/60"
  );
}

export function AccountList({
  accounts,
  bankOptions,
}: {
  accounts: AccountWithBalance[];
  bankOptions: readonly string[];
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
    return (
      <p className="text-sm text-black/50 dark:text-white/50">
        No accounts yet — add your first one above.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {order.map((a) => {
        const progress =
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
            className={`cursor-grab rounded-xl border border-black/10 p-5 active:cursor-grabbing dark:border-white/10 ${
              draggedId === a.id ? "opacity-50" : ""
            }`}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium">{a.name}</p>
                  {a.bank && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${bankBadgeClass(a.bank)}`}
                    >
                      {a.bank}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-2xl font-semibold">
                  {formatMoney(a.balance)}
                </p>
              </div>
              <form action={toggleAccountActive.bind(null, a.id, !a.is_active)}>
                <button
                  type="submit"
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    a.is_active
                      ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
                      : "bg-black/10 text-black/50 dark:bg-white/10 dark:text-white/50"
                  }`}
                >
                  {a.is_active ? "Active" : "Deactivated"}
                </button>
              </form>
            </div>

            {a.goal && a.goal > 0 && (
              <div className="mt-4">
                <div className="flex justify-between text-xs text-black/50 dark:text-white/50">
                  <span>
                    {formatMoney(a.balance)} / {formatMoney(a.goal)}
                  </span>
                  <span>{progress?.toFixed(0)}%</span>
                </div>
                <div className="mt-1 h-1.5 w-full rounded-full bg-black/10 dark:bg-white/10">
                  <div
                    className="h-1.5 rounded-full bg-black dark:bg-white"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            <form
              action={(formData: FormData) => {
                const raw = String(formData.get("goal") ?? "").trim();
                const goal = raw ? Number(raw) : null;
                updateAccountGoal(a.id, goal);
              }}
              className="mt-2 flex items-center gap-2"
            >
              <input
                type="number"
                step="0.01"
                name="goal"
                defaultValue={a.goal ?? ""}
                placeholder="Set goal"
                className="w-full rounded-md border border-black/15 bg-transparent px-2 py-1 text-xs dark:border-white/15"
              />
              <button
                type="submit"
                className="shrink-0 rounded-md border border-black/15 px-2 py-1 text-xs dark:border-white/15"
              >
                Save
              </button>
            </form>

            <form
              action={(formData: FormData) => {
                const bank = String(formData.get("bank") ?? "").trim() || null;
                updateAccountBank(a.id, bank);
              }}
              className="mt-4 flex items-center gap-2"
            >
              <input
                name="bank"
                list="bank-options"
                defaultValue={a.bank ?? ""}
                placeholder="Set bank"
                className="w-full rounded-md border border-black/15 bg-transparent px-2 py-1 text-xs dark:border-white/15"
              />
              <datalist id="bank-options">
                {bankOptions.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
              <button
                type="submit"
                className="shrink-0 rounded-md border border-black/15 px-2 py-1 text-xs dark:border-white/15"
              >
                Save
              </button>
            </form>
          </div>
        );
      })}
    </div>
  );
}
