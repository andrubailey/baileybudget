"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export type DataQualityIssue = {
  key: string;
  count: number;
  label: string;
  href: string;
};

const DISMISSED_KEY = "data-quality-banner-dismissed";

// A standing notice, not a toast — it doesn't time out and it's mounted in
// the shared (app) layout instead of any one page, so it's visible no
// matter where you navigate until you either fix the underlying data or
// dismiss it. Dismissing only hides today's exact set of issues (tracked by
// a signature in localStorage): if a new uncategorized transaction shows up
// tomorrow, or the count changes at all, it comes back.
export function DataQualityBanner({ issues }: { issues: DataQualityIssue[] }) {
  const active = issues.filter((i) => i.count > 0);
  const signature = active.map((i) => `${i.key}:${i.count}`).join("|");

  // Starts hidden on the server (no access to localStorage there) and
  // reconciles after mount — same pattern as the sidebar's isMac check —
  // rather than risk a hydration mismatch by reading it during render.
  const [dismissedSignature, setDismissedSignature] = useState<string | null>(
    "__unresolved__",
  );

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(DISMISSED_KEY);
    } catch {
      // ignore — localStorage unavailable
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing with localStorage, an external system, after mount
    setDismissedSignature(stored);
  }, []);

  if (active.length === 0) return null;
  if (dismissedSignature === "__unresolved__" || dismissedSignature === signature) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISSED_KEY, signature);
    } catch {
      // ignore — localStorage unavailable
    }
    setDismissedSignature(signature);
  }

  return (
    <div className="animate-fade-in-up flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-caution-border bg-caution-bg px-4 py-2.5 text-sm text-caution-strong sm:px-6 lg:px-8">
      <span className="flex shrink-0 items-center gap-1.5 font-medium">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a1 1 0 0 0 .86 1.5h18.64a1 1 0 0 0 .86-1.5L13.71 3.86a1 1 0 0 0-1.72 0Z"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Needs attention
      </span>
      <div className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-1">
        {active.map((issue) => (
          <Link
            key={issue.key}
            href={issue.href}
            className="underline-offset-2 hover:underline"
          >
            {issue.count} {issue.label}
          </Link>
        ))}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="-my-1 flex size-7 shrink-0 items-center justify-center rounded-md text-caution-strong transition-colors hover:bg-caution-border"
      >
        ✕
      </button>
    </div>
  );
}
