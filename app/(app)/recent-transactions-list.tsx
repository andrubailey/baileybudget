"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Account, Category, Transaction } from "@/lib/types";
import type { SplitDetail } from "@/lib/queries";
import { toAccountLookup } from "@/lib/transaction-presentation";
import { TransactionDetailModal } from "@/app/(app)/transaction-detail-modal";
import { TransactionRow } from "@/app/(app)/transaction-row";
import { isPendingTransaction, usePendingTransactions } from "@/app/(app)/pending-transactions";
import { deleteTransaction, restoreTransaction } from "@/app/actions";
import { useContextMenu } from "@/app/(app)/context-menu";
import { transactionMenuItems, useTransactionQuickActions } from "@/app/(app)/transaction-menu";
import { useToast } from "@/app/(app)/toast";
import { useExitingPanel } from "@/app/(app)/use-exiting-panel";

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
  splitsByTransaction,
}: {
  transactions: Transaction[];
  accounts: Account[];
  categories: Category[];
  maxRows?: number;
  // Lets the detail panel tell a split parent apart from a plain
  // uncategorized transaction — see TransactionDetailModal's `splits` prop.
  splitsByTransaction?: Map<string, SplitDetail[]>;
}) {
  // 160ms matches .animate-drawer-out (see globals.css) — the panel is a
  // right-edge slide-over.
  const detail = useExitingPanel<string>(160);
  const editingId = detail.value;
  const detailClosing = detail.closing;
  const openDetail = detail.open;
  const closeDetail = detail.close;
  const showToast = useToast();

  // Right-click menu — same options as the Transactions table (minus
  // selection). Quick edits show immediately; a delete hides the row at
  // once with an Undo bar, then the server refresh drops it for real.
  const contextMenu = useContextMenu();
  const [localEdits, setLocalEdits] = useState<Record<string, Partial<Transaction>>>({});
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [undoRow, setUndoRow] = useState<{ id: string; description: string } | null>(null);
  const [lastTransactions, setLastTransactions] = useState(transactions);
  if (transactions !== lastTransactions) {
    setLastTransactions(transactions);
    if (Object.keys(localEdits).length > 0) setLocalEdits({});
  }
  const setLocalEdit = useCallback((id: string, patch: Partial<Transaction> | null) => {
    setLocalEdits((prev) => {
      const next = { ...prev };
      if (patch) next[id] = { ...prev[id], ...patch };
      else delete next[id];
      return next;
    });
  }, []);
  const quickActions = useTransactionQuickActions(setLocalEdit);

  async function handleDelete(t: Transaction) {
    setHiddenIds((prev) => new Set(prev).add(t.id));
    setUndoRow({ id: t.id, description: t.description });
    setTimeout(() => setUndoRow((current) => (current?.id === t.id ? null : current)), 8000);
    await deleteTransaction(t.id);
    showToast("Transaction deleted");
  }

  async function handleUndo() {
    if (!undoRow) return;
    const { id } = undoRow;
    setUndoRow(null);
    await restoreTransaction(id);
    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    showToast("Transaction restored");
  }

  const pendingMerged = usePendingTransactions(transactions);
  const withPending = useMemo(
    () =>
      pendingMerged
        .filter((t) => !hiddenIds.has(t.id))
        .map((t) => (localEdits[t.id] ? { ...t, ...localEdits[t.id] } : t)),
    [pendingMerged, hiddenIds, localEdits],
  );

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

  const detailTransaction = editingId
    ? (withPending.find((t) => t.id === editingId) ?? null)
    : null;

  return (
    <>
      {undoRow && (
        <div className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-accent-border bg-accent-soft px-3 py-2 text-sm">
          <span className="min-w-0 truncate text-accent">Deleted &ldquo;{undoRow.description}&rdquo;.</span>
          <button
            type="button"
            onClick={handleUndo}
            className="shrink-0 font-semibold text-accent underline underline-offset-2 hover:text-accent-bright"
          >
            Undo
          </button>
        </div>
      )}
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
                onClick={isPendingTransaction(t) ? undefined : () => openDetail(t.id)}
                onContextMenu={
                  isPendingTransaction(t)
                    ? undefined
                    : (e) =>
                        contextMenu.open(
                          e,
                          transactionMenuItems(t, {
                            accountsById,
                            accounts,
                            categories,
                            isSplit: !!splitsByTransaction?.get(t.id)?.length,
                            onOpen: () => openDetail(t.id),
                            onDelete: () => handleDelete(t),
                            actions: quickActions,
                          }),
                        )
                }
                className={isPendingTransaction(t) ? "animate-pulse opacity-60" : ""}
                index={i}
              />
            );
          })}
        </div>
      </div>

      {contextMenu.menu}
      {detailTransaction && (
        <TransactionDetailModal
          transaction={detailTransaction}
          accounts={accounts}
          categories={categories}
          splits={splitsByTransaction?.get(detailTransaction.id)}
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
