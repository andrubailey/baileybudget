"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createSplitTransaction, createTransaction, createTransfer } from "@/app/actions";
import { withdrawPendingTransaction } from "@/app/(app)/pending-transactions";
import {
  decodeSplitRows,
  fieldsToFormData,
  flushOfflineQueue,
  getQueue,
  QUEUE_CHANGED_EVENT,
} from "@/lib/offline-queue";

// A transaction saved with no connection is staged in lib/offline-queue.ts
// rather than lost — this is the only thing that actually drains that
// queue. Used once, by NotificationsProvider in the shared layout, so a
// queued entry from one screen still gets flushed even if you've since
// navigated away from where you added it; the notifications panel shows the
// count and state it returns.
export function useOfflineQueueSync() {
  const router = useRouter();
  // Lazy-initialized (not set from an effect) so a queue left over from
  // before a reload shows up on the very first render instead of a flash of
  // "no banner" followed by one appearing a tick later.
  const [count, setCount] = useState<number>(() => (typeof window === "undefined" ? 0 : getQueue().length));
  const [flushing, setFlushing] = useState(false);
  const flushingRef = useRef(false);

  const attemptFlush = useCallback(async () => {
    if (flushingRef.current || getQueue().length === 0) return;
    flushingRef.current = true;
    setFlushing(true);
    const { landed, remaining } = await flushOfflineQueue({
      transaction: (fields) => createTransaction(fieldsToFormData(fields)),
      transfer: (fields) => createTransfer(fieldsToFormData(fields)),
      split: (fields) => createSplitTransaction(fieldsToFormData(fields), decodeSplitRows(fields)),
    });
    for (const pendingId of landed) withdrawPendingTransaction(pendingId);
    // Pulls the now-real rows into every screen currently on view, the same
    // way a manual pull-to-refresh does — otherwise the ghost row would sit
    // there "queued" forever even after actually landing, until the next
    // unrelated revalidation happened to sweep it away.
    if (landed.length > 0) router.refresh();
    setCount(remaining);
    setFlushing(false);
    flushingRef.current = false;
  }, [router]);

  useEffect(() => {
    function onQueueChanged() {
      setCount(getQueue().length);
    }
    window.addEventListener(QUEUE_CHANGED_EVENT, onQueueChanged);
    window.addEventListener("online", attemptFlush);
    // Covers reopening the app after being offline — "online" only fires on
    // the transition, not for a tab that was already open (or freshly
    // launched) while already connected with items left over from before.
    attemptFlush();
    return () => {
      window.removeEventListener(QUEUE_CHANGED_EVENT, onQueueChanged);
      window.removeEventListener("online", attemptFlush);
    };
  }, [attemptFlush]);

  return { count, flushing };
}
