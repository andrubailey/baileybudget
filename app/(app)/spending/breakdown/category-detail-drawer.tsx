"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { upsertBudgetLine } from "@/app/actions";
import { formatMoney, formatDate } from "@/lib/format";
import { getCategoryColor } from "@/lib/category-colors";
import type { Account, Category } from "@/lib/types";
import { CategoryChip } from "@/app/(app)/category-chip";
import { TransactionAvatar } from "@/app/(app)/transaction-row";
import { useToast } from "@/app/(app)/toast";
import { PencilIcon } from "./breakdown-panel";
import type { CategoryRow } from "./breakdown-panel";

// Slide-over for one category: set its budget inline, see this month vs.
// its six-month average, a little month-by-month history, and the
// transactions behind this month's number.
export function CategoryDetailDrawer({
  row,
  periodId,
  periodName,
  onClose,
}: {
  row: CategoryRow;
  periodId: string;
  periodName: string;
  accounts: Account[];
  categories: Category[];
  onClose: () => void;
}) {
  const [closing, setClosing] = useState(false);
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState(row.planned > 0 ? String(row.planned) : "");
  const [saving, setSaving] = useState(false);
  const showToast = useToast();

  function close() {
    setClosing(true);
    setTimeout(onClose, 150);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveBudget() {
    const amount = Number(budgetInput || 0);
    setEditingBudget(false);
    if (amount === row.planned) return;
    setSaving(true);
    const result = await upsertBudgetLine(row.id, periodId, amount);
    setSaving(false);
    if (!result.ok) {
      showToast(result.error ? `Couldn't save: ${result.error}` : "Couldn't save budget");
      return;
    }
    showToast(`${row.name} budget set to ${formatMoney(amount)}`);
  }

  const max = Math.max(1, ...row.history.map((h) => h.amount));
  const color = getCategoryColor(row.id);

  return (
    <div
      className={`fixed inset-0 z-[100] flex justify-end bg-black/40 ${closing ? "animate-modal-backdrop-out" : "animate-modal-backdrop"}`}
      onClick={close}
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`${row.name} details`}
        className={`flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-border bg-surface shadow-modal ${
          closing ? "animate-drawer-out" : "animate-drawer-in"
        }`}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <p className="text-section-label">Category detail</p>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="-mr-1.5 flex size-9 items-center justify-center rounded-lg text-text-faint transition-colors hover:bg-bg hover:text-text"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="card-flush divide-y divide-border">
            <div className="px-4 py-3">
              <CategoryChip id={row.id} name={row.name} icon={row.icon} size="md" />
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              {editingBudget ? (
                <label className="relative flex-1">
                  <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-text-faint">$</span>
                  <input
                    autoFocus
                    inputMode="decimal"
                    value={budgetInput}
                    onChange={(e) => setBudgetInput(e.target.value.replace(/[^\d.]/g, ""))}
                    onBlur={saveBudget}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                      if (e.key === "Escape") {
                        setBudgetInput(row.planned > 0 ? String(row.planned) : "");
                        setEditingBudget(false);
                      }
                    }}
                    placeholder="0.00"
                    className="tabular w-full rounded-lg border border-border bg-bg py-2 pr-3 pl-7 text-sm text-text outline-none focus:border-accent"
                  />
                </label>
              ) : (
                <p className="text-sm font-medium text-text">
                  {row.planned > 0 ? (
                    <>
                      Budget <span className="tabular">{formatMoney(row.planned)}</span>
                      <span className="text-text-faint"> · {periodName}</span>
                    </>
                  ) : (
                    "Set a budget"
                  )}
                </p>
              )}
              {!editingBudget && (
                <button
                  type="button"
                  onClick={() => setEditingBudget(true)}
                  disabled={saving}
                  aria-label="Edit budget"
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-bg hover:text-text disabled:opacity-50"
                >
                  <PencilIcon />
                </button>
              )}
            </div>
          </div>

          <div className="card-flush grid grid-cols-2 divide-x divide-border">
            <Stat label="Spent this month" value={row.actual} />
            <Stat label="Monthly average" value={row.monthlyAverage} />
          </div>

          <div className="card-flush px-4 py-4">
            <p className="text-section-label mb-3">Last 6 months</p>
            <div className="grid grid-cols-6 items-end gap-2">
              {row.history.map((h) => {
                const isCurrent = h === row.history[row.history.length - 1];
                return (
                  <div key={h.month} className="flex flex-col items-center gap-1.5">
                    <span className="tabular text-[11px] text-text-muted">{formatMoney(h.amount).replace(/\.\d\d$/, "")}</span>
                    <span className="flex h-16 w-full items-end">
                      <span
                        className="animate-bar-grow block w-full rounded-sm"
                        style={{
                          height: `${h.amount > 0 ? Math.max(6, (h.amount / max) * 100) : 3}%`,
                          backgroundColor: isCurrent ? color : "var(--neutral-track)",
                        }}
                      />
                    </span>
                    <span className="text-[11px] text-text-faint">{monthLabel(h.month)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-section-label mb-2">Transactions · {periodName}</p>
            {row.transactions.length === 0 ? (
              <p className="py-6 text-center text-sm text-text-muted">No transactions in this category this month.</p>
            ) : (
              <ul className="divide-y divide-border">
                {row.transactions.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 py-2.5">
                    <TransactionAvatar label={t.description} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text">{t.description}</p>
                      <p className="text-metadata">{formatDate(t.txn_date)}</p>
                    </div>
                    <span className="tabular text-amount text-text">-{formatMoney(t.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
            <Link
              href={`/transactions?period=${periodId}&category=${row.id}`}
              className="mt-3 inline-block text-xs font-medium text-accent underline underline-offset-2"
            >
              Open in Transactions
            </Link>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-4 py-3 text-center">
      <p className="text-metadata">{label}</p>
      <p className="tabular mt-1 text-lg font-semibold text-text">{formatMoney(value)}</p>
    </div>
  );
}

function monthLabel(month: string) {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
}
