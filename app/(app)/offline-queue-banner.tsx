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
// queue and the only visible sign it exists. Mounted once in the shared
// layout so it's the same banner no matter which screen you're on when the
// connection comes back, and so a queued entry from one screen still gets
// flushed even if you've since navigated away from where you added it.
export function OfflineQueueBanner() {
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

  if (count === 0) return null;

  return (
    <div
      role="status"
      className="sticky top-0 z-30 flex items-center justify-center gap-2 bg-caution-bg px-4 py-2 text-center text-xs font-medium text-caution-strong"
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.5rem)" }}
    >
      {flushing ? (
        <>
          <span className="size-1.5 animate-pulse rounded-full bg-caution-strong" aria-hidden="true" />
          Sending {count} queued {count === 1 ? "entry" : "entries"}…
        </>
      ) : (
        <>
          {count} {count === 1 ? "entry" : "entries"} waiting for a connection — will send automatically.
        </>
      )}
    </div>
  );
}
