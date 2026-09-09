"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { formatMoney, formatDate, transferDisplayDescription } from "@/lib/format";
import { getLetterColors } from "@/lib/letter-colors";
import type { Account, Category, Transaction } from "@/lib/types";
import { TransactionDetailModal } from "@/app/(app)/transaction-detail-modal";

// Client-side so a row click can open the same TransactionDetailModal the
// full Transactions page uses, instead of the Overview page's Recent
// Transactions list being read-only.
export function RecentTransactionsList({
  transactions,
  accounts,
  categories,
}: {
  transactions: Transaction[];
  accounts: Account[];
  categories: Category[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detailClosing, setDetailClosing] = useState(false);

  // Rather than scrolling (or letting extra rows push the card taller — see
  // DashboardEqualHeightRow, which fixes this card's height to match the
  // Budget card), only as many rows as actually fit the measured space are
  // rendered — no partial row, no scrollbar. Measures the available height
  // of this list's own container against one rendered row's height and
  // trims to whatever whole number of rows fits; re-measures on resize.
  const containerRef = useRef<HTMLDivElement>(null);
  const firstRowRef = useRef<HTMLButtonElement | null>(null);
  const [visibleCount, setVisibleCount] = useState(7);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    function recompute() {
      const rowHeight = firstRowRef.current?.offsetHeight;
      if (!container || !rowHeight) return;
      const count = Math.max(1, Math.floor(container.clientHeight / rowHeight));
      setVisibleCount((current) => (current === count ? current : count));
    }
    recompute();
    const observer = new ResizeObserver(recompute);
    observer.observe(container);
    return () => observer.disconnect();
  }, [transactions.length]);

  const accountById = useMemo(
    () => new Map(accounts.map((a) => [a.id, a.name])),
    [accounts],
  );
  const accountBankById = useMemo(
    () => new Map(accounts.map((a) => [a.id, a.bank])),
    [accounts],
  );
  const allTransactions = transactions;
  const visibleTransactions = transactions.slice(0, visibleCount);
  // Every distinct person who's logged one of these transactions — backs
  // the detail modal's "Created by" dropdown, same as the Transactions page.
  const knownCreators = useMemo(() => {
    const byEmail = new Map<string, { id: string | null; email: string }>();
    for (const t of allTransactions) {
      if (t.created_by_email) {
        byEmail.set(t.created_by_email, { id: t.created_by, email: t.created_by_email });
      }
    }
    return Array.from(byEmail.values());
  }, [allTransactions]);

  function closeDetail() {
    setDetailClosing(true);
    setTimeout(() => {
      setEditingId(null);
      setDetailClosing(false);
    }, 150);
  }

  const detailTransaction = editingId
    ? (allTransactions.find((t) => t.id === editingId) ?? null)
    : null;

  return (
    <>
      <div ref={containerRef} className="h-full min-h-0 overflow-hidden">
      <div className="divide-y divide-border">
        {visibleTransactions.map((t, i) => {
          const displayDescription = transferDisplayDescription(
            t.description,
            t.kind,
            t.to_account_id ? accountBankById.get(t.to_account_id) : null,
          );
          const avatar = getLetterColors(displayDescription);
          // At-a-glance "which account" — the whole reason this used to be
          // split into Business/Personal sections, now just a label on the
          // row itself instead of two separate lists to scan.
          const accountLabel =
            t.kind === "transfer"
              ? [t.account_id, t.to_account_id]
                  .map((id) => (id ? accountById.get(id) : null))
                  .filter(Boolean)
                  .join(" → ")
              : t.account_id
                ? accountById.get(t.account_id)
                : null;
          return (
            <button
              key={t.id}
              ref={i === 0 ? firstRowRef : undefined}
              type="button"
              onClick={() => setEditingId(t.id)}
              style={{ animationDelay: `${i * 35}ms` }}
              className="animate-fade-in-up flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-bg"
            >
              <span
                className="flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                style={{ backgroundColor: avatar.bg, color: avatar.text }}
              >
                {displayDescription.trim()[0]?.toUpperCase() ?? "?"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text">
                  {displayDescription}
                </p>
                <p className="truncate text-xs text-text-faint">
                  {formatDate(t.txn_date)}
                  {accountLabel && <> · {accountLabel}</>}
                </p>
              </div>
              <span
                className={`tabular ml-4 shrink-0 text-sm font-medium ${
                  t.kind === "income" ? "text-success" : "text-text"
                }`}
              >
                {t.kind === "income" ? "+" : t.kind === "expense" ? "-" : ""}
                {formatMoney(t.amount)}
              </span>
            </button>
          );
        })}
      </div>
      </div>

      {detailTransaction && (
        <TransactionDetailModal
          transaction={detailTransaction}
          accounts={accounts}
          categories={categories}
          knownCreators={knownCreators}
          accountName={
            detailTransaction.account_id
              ? (accountById.get(detailTransaction.account_id) ?? "—")
              : "—"
          }
          toAccountName={
            detailTransaction.to_account_id
              ? (accountById.get(detailTransaction.to_account_id) ?? "—")
              : null
          }
          closing={detailClosing}
          onClose={closeDetail}
        />
      )}
    </>
  );
}
