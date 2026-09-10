"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { upsertBudgetLine } from "@/app/actions";
import { fetchCategoryHistory } from "@/app/(app)/category-detail-actions";
import { CategoryChip } from "@/app/(app)/category-chip";
import { Money } from "@/app/(app)/money";
import { SegmentedProgress } from "@/app/(app)/segmented-progress";
import { useToast } from "@/app/(app)/toast";
import { formatDate } from "@/lib/format";
import type { CategoryMonthSpend, CategoryProgress } from "@/lib/queries";

const CLOSE_MS = 160;

function monthShort(month: string) {
  return new Date(`${month}-01T00:00:00Z`).toLocaleString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
}

// Slide-over detail for one budget category: this month's budget and what's
// left (editable), last month and the monthly average, a six-month history,
// and this month's transactions. Portaled to <body> because the rows that
// open it animate in with a CSS transform, and a transformed ancestor would
// turn this fixed overlay into one clipped to the row.
export function CategoryDetailPanel({
  category: c,
  editablePeriodId,
  onClose,
}: {
  category: CategoryProgress;
  editablePeriodId: string | null;
  onClose: () => void;
}) {
  const [closing, setClosing] = useState(false);
  const [history, setHistory] = useState<CategoryMonthSpend[] | null>(null);
  const [plannedInput, setPlannedInput] = useState(String(c.planned));
  // A save revalidates the page and hands this a fresh `category` — resync
  // the input so it shows the saved amount rather than the stale draft.
  const [lastPlanned, setLastPlanned] = useState(c.planned);
  if (c.planned !== lastPlanned) {
    setLastPlanned(c.planned);
    setPlannedInput(String(c.planned));
  }
  const [saving, startSaving] = useTransition();
  const showToast = useToast();

  useEffect(() => {
    let cancelled = false;
    fetchCategoryHistory(c.id)
      .then((rows) => {
        if (!cancelled) setHistory(rows);
      })
      .catch(() => {
        if (!cancelled) setHistory([]);
      });
    return () => {
      cancelled = true;
    };
  }, [c.id]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setClosing(true);
      setTimeout(onClose, CLOSE_MS);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function close() {
    setClosing(true);
    setTimeout(onClose, CLOSE_MS);
  }

  function save() {
    if (!editablePeriodId) return;
    const amount = Number(plannedInput || 0);
    if (!Number.isFinite(amount) || amount === c.planned) return;
    startSaving(async () => {
      const result = await upsertBudgetLine(c.id, editablePeriodId, amount);
      if (!result.ok) {
        showToast(result.error ? `Couldn't save: ${result.error}` : "Couldn't save budget");
        return;
      }
      showToast(`${c.name} budget saved`);
    });
  }

  const pct =
    c.planned > 0 ? Math.min(100, (c.actual / c.planned) * 100) : c.actual > 0 ? 100 : 0;
  const lastMonth = history && history.length >= 2 ? history[history.length - 2].amount : null;
  const prior = history ? history.slice(0, -1) : [];
  const average =
    prior.length > 0 ? prior.reduce((sum, m) => sum + m.amount, 0) / prior.length : null;
  const maxMonth = history ? Math.max(1, ...history.map((m) => m.amount)) : 1;
  const recent = [...c.transactions]
    .sort((a, b) => b.txn_date.localeCompare(a.txn_date))
    .slice(0, 8);
  const transactionsHref = editablePeriodId
    ? `/transactions?period=${editablePeriodId}&category=${c.id}`
    : `/transactions?category=${c.id}`;

  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`${c.name} details`}>
      <div
        className={`absolute inset-0 bg-black/40 ${
          closing ? "animate-modal-backdrop-out" : "animate-modal-backdrop"
        }`}
        onClick={close}
      />
      <aside
        className={`absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-surface shadow-modal ${
          closing ? "animate-drawer-out" : "animate-drawer-in"
        }`}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
          <p className="card-label text-text-muted">Category detail</p>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="-mr-2 flex size-9 items-center justify-center rounded-lg text-text-faint transition-colors hover:bg-bg hover:text-text"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <section className="rounded-xl border border-border p-4">
            <CategoryChip id={c.id} name={c.name} icon={c.icon} />
            <p className="mt-3 text-sm text-text-muted">
              {c.planned > 0 ? (
                c.overBudget ? (
                  <>
                    <Money amount={Math.abs(c.remaining)} className="font-semibold text-negative" /> over a{" "}
                    <Money amount={c.planned} /> budget
                  </>
                ) : (
                  <>
                    <Money amount={c.remaining} className="font-semibold text-text" /> left to spend of a{" "}
                    <Money amount={c.planned} /> budget
                  </>
                )
              ) : (
                <>
                  No budget set · <Money amount={c.actual} /> spent
                </>
              )}
            </p>
            <SegmentedProgress pct={pct} overBudget={c.overBudget} className="mt-2" />

            {editablePeriodId && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  save();
                }}
                className="mt-4 flex items-end gap-2"
              >
                <label className="flex-1 space-y-1.5">
                  <span className="text-xs font-medium text-text-muted">Budget this month</span>
                  <span className="relative block">
                    <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-text-faint">
                      $
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      inputMode="decimal"
                      value={plannedInput}
                      onChange={(e) => setPlannedInput(e.target.value)}
                      className="tabular no-spinner w-full rounded-lg border border-border bg-bg py-2 pr-3 pl-6 text-sm text-text outline-none focus:border-accent"
                    />
                  </span>
                </label>
                <button
                  type="submit"
                  disabled={saving || Number(plannedInput || 0) === c.planned}
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </form>
            )}
          </section>

          <section className="grid grid-cols-2 divide-x divide-border rounded-xl border border-border">
            <div className="p-4">
              <p className="text-xs text-text-muted">Spent last month</p>
              <p className="tabular mt-1 text-base font-semibold text-text">
                {history === null ? "…" : lastMonth === null ? "—" : <Money amount={lastMonth} />}
              </p>
            </div>
            <div className="p-4">
              <p className="text-xs text-text-muted">Monthly average</p>
              <p className="tabular mt-1 text-base font-semibold text-text">
                {history === null ? "…" : average === null ? "—" : <Money amount={average} />}
              </p>
            </div>
          </section>

          <section className="rounded-xl border border-border p-4">
            <p className="card-label text-text-muted">Last 6 months</p>
            {history === null ? (
              <p className="mt-6 mb-4 text-center text-xs text-text-faint">Loading history…</p>
            ) : (
              <div className="mt-4 flex h-36 items-end gap-2">
                {history.map((m, i) => {
                  const isCurrent = i === history.length - 1;
                  return (
                    <div key={m.month} className="flex h-full min-w-0 flex-1 flex-col items-center gap-1.5">
                      <span className="tabular truncate text-[10px] text-text-faint">
                        {m.amount > 0 ? <Money amount={m.amount} /> : "—"}
                      </span>
                      <div className="flex w-full flex-1 items-end">
                        <div
                          className={`w-full rounded-md transition-[height] duration-300 ${
                            isCurrent ? "bg-accent" : "bg-neutral-track"
                          }`}
                          style={{ height: `${m.amount > 0 ? Math.max(4, (m.amount / maxMonth) * 100) : 2}%` }}
                        />
                      </div>
                      <span className={`text-[11px] ${isCurrent ? "font-semibold text-text" : "text-text-muted"}`}>
                        {monthShort(m.month)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-border p-4">
            <p className="card-label text-text-muted">This month</p>
            {recent.length === 0 ? (
              <p className="mt-3 text-sm text-text-faint">No transactions in this category yet.</p>
            ) : (
              <ul className="mt-2 divide-y divide-border">
                {recent.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-text">{t.description}</p>
                      <p className="text-xs text-text-faint">{formatDate(t.txn_date)}</p>
                    </div>
                    <Money amount={t.amount} className="tabular shrink-0 text-sm font-medium text-text" />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="shrink-0 border-t border-border p-4">
          <Link
            href={transactionsHref}
            className="flex w-full items-center justify-center rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-text transition-colors hover:bg-bg"
          >
            View all transactions
          </Link>
        </div>
      </aside>
    </div>,
    document.body,
  );
}
