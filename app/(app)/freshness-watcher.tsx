"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getActivitySignature } from "./freshness-actions";

// This is a 2-person household sharing one live dataset — whoever's on the
// phone at the store logging a receipt can invalidate what's on the other
// person's screen at their desk mid-session, with nothing here to tell them
// their view is now stale. This polls a cheap fingerprint of the
// transactions table (see getActivitySignature) periodically and on
// refocus, and surfaces a plain "reload" nudge the instant it disagrees
// with what this page loaded with — never auto-reloads, since yanking the
// page out from under someone mid-edit would be worse than a stale view.
const POLL_MS = 60_000;

export function FreshnessWatcher({ initialSignature }: { initialSignature: string }) {
  const router = useRouter();
  const [stale, setStale] = useState(false);
  const baseline = useRef(initialSignature);

  // A server-driven prop change (router.refresh(), or just navigating to a
  // page that re-renders the shared layout) means the baseline itself moved
  // forward — resync instead of comparing against what's now a stale value.
  useEffect(() => {
    baseline.current = initialSignature;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resyncing with a fresh server-provided prop, not deriving render output
    setStale(false);
  }, [initialSignature]);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const next = await getActivitySignature();
        if (!cancelled && next !== baseline.current) setStale(true);
      } catch {
        // A failed check just tries again next tick — not worth surfacing.
      }
    }
    const interval = setInterval(check, POLL_MS);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, []);

  if (!stale) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[90] flex justify-center px-4">
      <div className="animate-fade-in-up pointer-events-auto flex items-center gap-3 rounded-full border border-accent-border bg-surface py-2 pr-2 pl-4 text-sm font-medium text-text shadow-raised">
        <span className="flex size-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
        New activity in the household
        <button
          type="button"
          onClick={() => router.refresh()}
          className="shrink-0 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-white transition-opacity hover:opacity-90"
        >
          Reload
        </button>
      </div>
    </div>
  );
}
