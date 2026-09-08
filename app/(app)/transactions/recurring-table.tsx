"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteRecurringTransaction,
  generateRecurringForPeriod,
  getPriceHistoryForRecurring,
  toggleRecurringActive,
} from "@/app/actions";
import { formatMoney, formatDate } from "@/lib/format";
import type { Account, Category, RecurringTransaction } from "@/lib/types";
import type { RecurringPricePoint } from "@/lib/queries";
import { EmptyState } from "@/app/(app)/empty-state";

export function RecurringTable({
  items,
  accounts,
  categories,
  currentPeriodId,
  currentPeriodName,
  postedIds,
}: {
  items: RecurringTransaction[];
  accounts: Account[];
  categories: Category[];
  currentPeriodId: string;
  currentPeriodName: string;
  postedIds: Set<string>;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [priceHistory, setPriceHistory] = useState<RecurringPricePoint[]>([]);
  // Tracks which specific rows have an in-flight toggle/delete, so a tap
  // shows immediate feedback instead of looking like nothing happened while
  // the server round-trip is in progress (Doherty Threshold).
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  function withRowPending(id: string, fn: () => Promise<void>) {
    setPendingIds((prev) => new Set(prev).add(id));
    fn().finally(() => {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    });
  }

  async function toggleHistory(id: string) {
    if (historyId === id) {
      setHistoryId(null);
      return;
    }
    setHistoryId(id);
    setPriceHistory(await getPriceHistoryForRecurring(id));
  }

  const accountName = (id: string | null) =>
    accounts.find((a) => a.id === id)?.name ?? "—";
  const categoryName = (id: string | null) =>
    categories.find((c) => c.id === id)?.name ?? "—";
  const todayOfMonth = new Date().getDate();

  // Reconciliation status: whether this period's expected charge has
  // actually been generated, is still upcoming, or is overdue and forgotten.
  function status(r: RecurringTransaction): {
    label: string;
    className: string;
  } {
    if (postedIds.has(r.id)) {
      return { label: "Posted", className: "bg-[#dcfae6] text-[#0b9055]" };
    }
    if (!r.is_active) {
      return { label: "Paused", className: "bg-bg text-text-faint" };
    }
    if (r.day_of_month <= todayOfMonth) {
      return { label: "Due", className: "bg-[#fef0c7] text-[#93370d]" };
    }
    return { label: "Upcoming", className: "bg-bg text-text-faint" };
  }

  function handleGenerate() {
    startTransition(async () => {
      await generateRecurringForPeriod(currentPeriodId);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-muted">
          Generate this period&apos;s ({currentPeriodName}) transactions from
          your recurring list.
        </p>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={isPending}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "Generating…" : `Generate for ${currentPeriodName}`}
        </button>
      </div>

      {/* Mobile: compact cards, no horizontal scroll. Desktop: full table. */}
      <div className="space-y-2 sm:hidden">
        {items.map((r) => {
          const s = status(r);
          const rowPending = pendingIds.has(r.id);
          return (
            <div
              key={r.id}
              className={`rounded-xl border border-border bg-surface p-3 shadow-card transition-opacity ${
                rowPending ? "opacity-60" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">
                  {r.description}
                </span>
                <span
                  className={`tabular shrink-0 text-sm font-medium ${
                    r.kind === "income" ? "text-success" : "text-text"
                  }`}
                >
                  {r.kind === "income" ? "+" : "-"}
                  {formatMoney(r.amount)}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="truncate text-xs text-text-faint">
                  Day {r.day_of_month} · {accountName(r.account_id)} ·{" "}
                  {categoryName(r.category_id)}
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${s.className}`}
                >
                  {s.label}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <button
                  type="button"
                  disabled={rowPending}
                  onClick={() =>
                    withRowPending(r.id, () =>
                      toggleRecurringActive(r.id, !r.is_active),
                    )
                  }
                  className={`rounded-md px-2 py-1 text-xs font-medium disabled:opacity-50 ${
                    r.is_active
                      ? "bg-accent-soft text-accent"
                      : "bg-bg text-text-faint"
                  }`}
                >
                  {r.is_active ? "Active" : "Paused"}
                </button>
                <button
                  type="button"
                  disabled={rowPending}
                  onClick={() =>
                    withRowPending(r.id, () => deleteRecurringTransaction(r.id))
                  }
                  className="text-xs font-medium text-text-faint hover:text-[#f04438] disabled:opacity-50"
                >
                  {rowPending ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          );
        })}
        {items.length === 0 && (
          <EmptyState message="No recurring transactions yet." />
        )}
      </div>

      <div className="hidden overflow-x-auto rounded-xl border border-border bg-surface shadow-card sm:block">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border bg-bg">
              <th className="px-6 py-2 text-xs font-medium text-text-muted">
                Description
              </th>
              <th className="px-6 py-2 text-xs font-medium text-text-muted">
                Amount
              </th>
              <th className="px-6 py-2 text-xs font-medium text-text-muted">
                Day
              </th>
              <th className="px-6 py-2 text-xs font-medium text-text-muted">
                Account
              </th>
              <th className="px-6 py-2 text-xs font-medium text-text-muted">
                Category
              </th>
              <th className="px-6 py-2 text-xs font-medium text-text-muted">
                {currentPeriodName} status
              </th>
              <th className="px-6 py-2 text-xs font-medium text-text-muted">
                Active
              </th>
              <th className="px-6 py-2 text-xs font-medium text-text-muted" />
            </tr>
          </thead>
          <tbody>
            {items.map((r) => {
              const rowPending = pendingIds.has(r.id);
              return (
                <Fragment key={r.id}>
                  <tr
                    className={`border-b border-border last:border-b-0 transition-opacity ${
                      rowPending ? "opacity-60" : ""
                    }`}
                  >
                    <td className="px-6 py-3 text-sm font-medium text-text">
                      {r.description}
                    </td>
                    <td
                      className={`tabular px-6 py-3 text-sm font-medium ${
                        r.kind === "income" ? "text-success" : "text-text"
                      }`}
                    >
                      {r.kind === "income" ? "+" : "-"}
                      {formatMoney(r.amount)}
                    </td>
                    <td className="tabular px-6 py-3 text-sm text-text-muted">
                      {r.day_of_month}
                    </td>
                    <td className="px-6 py-3 text-sm text-text-muted">
                      {accountName(r.account_id)}
                    </td>
                    <td className="px-6 py-3 text-sm text-text-muted">
                      {categoryName(r.category_id)}
                    </td>
                    <td className="px-6 py-3">
                      {(() => {
                        const s = status(r);
                        return (
                          <span
                            className={`rounded-full px-2 py-1 text-xs font-medium ${s.className}`}
                          >
                            {s.label}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-6 py-3">
                      <button
                        type="button"
                        disabled={rowPending}
                        onClick={() =>
                          withRowPending(r.id, () =>
                            toggleRecurringActive(r.id, !r.is_active),
                          )
                        }
                        className={`rounded-md px-2 py-1 text-xs font-medium disabled:opacity-50 ${
                          r.is_active
                            ? "bg-accent-soft text-accent"
                            : "bg-bg text-text-faint"
                        }`}
                      >
                        {r.is_active ? "Active" : "Paused"}
                      </button>
                    </td>
                    <td className="px-6 py-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => toggleHistory(r.id)}
                        className="mr-3 text-xs font-medium text-text-faint hover:text-accent"
                      >
                        History
                      </button>
                      <button
                        type="button"
                        disabled={rowPending}
                        onClick={() =>
                          withRowPending(r.id, () =>
                            deleteRecurringTransaction(r.id),
                          )
                        }
                        className="text-xs font-medium text-text-faint hover:text-[#f04438] disabled:opacity-50"
                      >
                        {rowPending ? "Deleting…" : "Delete"}
                      </button>
                    </td>
                  </tr>
                  {historyId === r.id && (
                    <tr className="border-b border-border bg-bg/40 last:border-b-0">
                      <td colSpan={8} className="px-6 py-3">
                        {priceHistory.length === 0 ? (
                          <p className="text-xs text-text-muted">
                            No generated transactions yet for this bill.
                          </p>
                        ) : (
                          <div className="flex flex-wrap gap-3">
                            {priceHistory.map((p, i) => {
                              const prev = priceHistory[i - 1];
                              const changed = prev && prev.amount !== p.amount;
                              return (
                                <span
                                  key={p.txn_date}
                                  className={`rounded-md px-2 py-1 text-xs font-medium ${
                                    changed
                                      ? "bg-[#fef0c7] text-[#93370d]"
                                      : "bg-bg text-text-muted"
                                  }`}
                                  title={formatDate(p.txn_date)}
                                >
                                  {formatDate(p.txn_date)}:{" "}
                                  {formatMoney(p.amount)}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={8} className="px-6 py-4">
                  <EmptyState message="No recurring transactions yet." />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
