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
const PENDING_QUEUED_EVENT = "budgetapp:transaction-pending-queued";

// `queued` distinguishes "saving right now" from "no connection — staged in
// the offline queue, will send once it's back" (see lib/offline-queue.ts).
// Same ghost row either way; only the label/styling a caller shows differs.
export type PendingTransaction = Transaction & { pending: true; queued?: boolean };

export function announcePendingTransaction(
  draft: Omit<Transaction, "id" | "created_at" | "updated_at" | "deleted_at" | "cleared" | "pending_approval" | "recurring_transaction_id" | "created_by" | "created_by_email"> &
    Partial<Pick<Transaction, "cleared" | "pending_approval" | "created_by_email">>,
): string {
  const id = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();
  const row: PendingTransaction = {
    id,
    created_at: now,
    updated_at: now,
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

// Flips an already-announced draft to "queued" — the submit failed because
// there's no connection (not because the server rejected it), so the row
// stays on screen but reads as "waiting for a connection" instead of
// "saving now" until lib/offline-queue.ts actually lands it.
export function markPendingQueued(id: string) {
  window.dispatchEvent(new CustomEvent(PENDING_QUEUED_EVENT, { detail: id }));
}

// Merges any in-flight drafts ahead of the real list. A plain in-flight
// draft is dropped the moment `transactions` changes identity — that's the
// revalidated server data landing, which now includes the real row. A
// *queued* one is kept regardless: it hasn't actually been saved anywhere
// yet, so an unrelated revalidation elsewhere (another edit, the freshness
// poll) shouldn't make it silently disappear before it's really synced.
export function usePendingTransactions(transactions: Transaction[]): Transaction[] {
  const [pending, setPending] = useState<PendingTransaction[]>([]);
  const [lastTransactions, setLastTransactions] = useState(transactions);
  if (transactions !== lastTransactions) {
    setLastTransactions(transactions);
    setPending((prev) => prev.filter((p) => p.queued));
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
    function handleQueued(e: Event) {
      const id = (e as CustomEvent<string>).detail;
      setPending((prev) => prev.map((p) => (p.id === id ? { ...p, queued: true } : p)));
    }
    window.addEventListener(PENDING_EVENT, handleAdd);
    window.addEventListener(PENDING_REMOVE_EVENT, handleRemove);
    window.addEventListener(PENDING_QUEUED_EVENT, handleQueued);
    return () => {
      window.removeEventListener(PENDING_EVENT, handleAdd);
      window.removeEventListener(PENDING_REMOVE_EVENT, handleRemove);
      window.removeEventListener(PENDING_QUEUED_EVENT, handleQueued);
    };
  }, []);

  return pending.length === 0 ? transactions : [...pending, ...transactions];
}

export function isPendingTransaction(t: Transaction): boolean {
  return t.id.startsWith("pending-");
}

export function isQueuedTransaction(t: Transaction): boolean {
  return isPendingTransaction(t) && (t as PendingTransaction).queued === true;
}
