"use client";

import { useEffect, useState } from "react";
import type { Transaction } from "@/lib/types";

// Optimistic inserts. The quick-add modals live in the sidebar chrome, far
// from whichever list is on screen, so they can't hand a new row to it
// directly — instead they broadcast a draft the moment the form submits,
// and any mounted list prepends it (marked pending) until the server's
// revalidated data arrives and replaces it. A failed save broadcasts a
// removal so the ghost row doesn't linger.
const PENDING_EVENT = "budgetapp:transaction-pending";
const PENDING_REMOVE_EVENT = "budgetapp:transaction-pending-remove";

export type PendingTransaction = Transaction & { pending: true };

export function announcePendingTransaction(
  draft: Omit<Transaction, "id" | "created_at" | "deleted_at" | "cleared" | "pending_approval" | "recurring_transaction_id" | "created_by" | "created_by_email"> &
    Partial<Pick<Transaction, "cleared" | "pending_approval" | "created_by_email">>,
): string {
  const id = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const row: PendingTransaction = {
    id,
    created_at: new Date().toISOString(),
    deleted_at: null,
    cleared: false,
    pending_approval: false,
    recurring_transaction_id: null,
    created_by: null,
    created_by_email: null,
    ...draft,
    pending: true,
  };
  window.dispatchEvent(new CustomEvent(PENDING_EVENT, { detail: row }));
  return id;
}

export function withdrawPendingTransaction(id: string) {
  window.dispatchEvent(new CustomEvent(PENDING_REMOVE_EVENT, { detail: id }));
}

// Merges any in-flight drafts ahead of the real list. Drafts are dropped
// the moment `transactions` changes identity — that's the revalidated
// server data landing, which now includes the real row.
export function usePendingTransactions(transactions: Transaction[]): Transaction[] {
  const [pending, setPending] = useState<PendingTransaction[]>([]);
  const [lastTransactions, setLastTransactions] = useState(transactions);
  if (transactions !== lastTransactions) {
    setLastTransactions(transactions);
    if (pending.length > 0) setPending([]);
  }

  useEffect(() => {
    function handleAdd(e: Event) {
      const row = (e as CustomEvent<PendingTransaction>).detail;
      setPending((prev) => [row, ...prev]);
    }
    function handleRemove(e: Event) {
      const id = (e as CustomEvent<string>).detail;
      setPending((prev) => prev.filter((p) => p.id !== id));
    }
    window.addEventListener(PENDING_EVENT, handleAdd);
    window.addEventListener(PENDING_REMOVE_EVENT, handleRemove);
    return () => {
      window.removeEventListener(PENDING_EVENT, handleAdd);
      window.removeEventListener(PENDING_REMOVE_EVENT, handleRemove);
    };
  }, []);

  return pending.length === 0 ? transactions : [...pending, ...transactions];
}

export function isPendingTransaction(t: Transaction): boolean {
  return t.id.startsWith("pending-");
}
