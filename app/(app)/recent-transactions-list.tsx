"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Account, Category, Transaction } from "@/lib/types";
import { toAccountLookup } from "@/lib/transaction-presentation";
import { TransactionDetailModal } from "@/app/(app)/transaction-detail-modal";
import { TransactionRow } from "@/app/(app)/transaction-row";
import { isPendingTransaction, usePendingTransactions } from "@/app/(app)/pending-transactions";

// Client-side so a row click can open the same TransactionDetailModal the
// full Transactions page uses, instead of the Overview page's Recent
// Transactions list being read-only.
export function RecentTransactionsList({
  transactions,
  accounts,
  categories,
  // When the parent isn't pinning this list's height (mobile, or a
  // standalone page), cap the rows here instead of measuring.
  maxRows,
}: {
  transactions: Transaction[];
  accounts: Account[];
  categories: Category[];
  maxRows?: number;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detailClosing, setDetailClosing] = useState(false);
  const withPending = usePendingTransactions(transactions);

  // Rather than scrolling (or letting extra rows push the card taller — see
  // DashboardEqualHeightRow, which fixes this card's height to match the
  // Budget card), only as many rows as actually fit the measured space are
  // rendered — no partial row, no scrollbar. Measures the available height
  // of this list's own container against one rendered row's height and
  // trims to whatever whole number of rows fits; re-measures on resize.
  const containerRef = useRef<HTMLDivElement>(null);
  const firstRowRef = useRef<HTMLButtonElement | null>(null);
  const [visibleCount, setVisibleCount] = useState(maxRows ?? 7);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    function recompute() {
      const rowHeight = firstRowRef.current?.offsetHeight;
      if (!container || !rowHeight) return;
      // A container whose height isn't being pinned by the parent (see
      // DashboardEqualHeightRow's data-pinned flag) reports its own content
      // height, which would always "fit" exactly the rows already rendered
      // — use the caller's cap (or the default) in that case instead.
      const pinned = container.closest('[data-pinned="true"]') !== null;
      const fits = Math.max(1, Math.floor(container.clientHeight / rowHeight));
      const count = pinned ? fits : (maxRows ?? 7);
      setVisibleCount((current) => (current === count ? current : count));
    }
    recompute();
    const observer = new ResizeObserver(recompute);
    observer.observe(container);
    return () => observer.disconnect();
  }, [transactions.length, maxRows]);

  const accountsById = useMemo(() => toAccountLookup(accounts), [accounts]);
  const accountNameById = useMemo(
    () => new Map(accounts.map((a) => [a.id, a.name])),
    [accounts],
  );
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const visibleTransactions = withPending.slice(0, visibleCount);
  // Every distinct person who's logged one of these transactions — backs
  // the detail modal's "Created by" dropdown, same as the Transactions page.
  const knownCreators = useMemo(() => {
    const byEmail = new Map<string, { id: string | null; email: string }>();
    for (const t of transactions) {
      if (t.created_by_email) {
        byEmail.set(t.created_by_email, { id: t.created_by, email: t.created_by_email });
      }
    }
    return Array.from(byEmail.values());
  }, [transactions]);

  function closeDetail() {
    setDetailClosing(true);
    setTimeout(() => {
      setEditingId(null);
      setDetailClosing(false);
    }, 150);
  }

  const detailTransaction = editingId
    ? (transactions.find((t) => t.id === editingId) ?? null)
    : null;

  return (
    <>
      <div ref={containerRef} className="h-full min-h-0 overflow-hidden">
        <div className="divide-y divide-border">
          {visibleTransactions.map((t, i) => {
            const category = t.category_id ? (categoryById.get(t.category_id) ?? null) : null;
            return (
              <TransactionRow
                key={t.id}
                ref={i === 0 ? firstRowRef : undefined}
                transaction={t}
                accountsById={accountsById}
                category={category}
                meta={{ date: true, account: true, category: false }}
                onClick={isPendingTransaction(t) ? undefined : () => setEditingId(t.id)}
                className={isPendingTransaction(t) ? "animate-pulse opacity-60" : ""}
                index={i}
              />
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
              ? (accountNameById.get(detailTransaction.account_id) ?? "—")
              : "—"
          }
          toAccountName={
            detailTransaction.to_account_id
              ? (accountNameById.get(detailTransaction.to_account_id) ?? "—")
              : null
          }
          closing={detailClosing}
          onClose={closeDetail}
        />
      )}
    </>
  );
}
