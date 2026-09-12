"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { WeeklyRecapAlert, useIsRecapReviewed } from "@/app/(app)/weekly-recap-alert";
import type { RecapData } from "@/app/(app)/weekly-recap-card";

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
//
// The weekly recap rides along in the same bar (see WeeklyRecapAlert) but
// isn't part of that dismiss signature — it manages its own "reviewed this
// week" state, so the ✕ here only clears data-quality issues, and the bar
// stays visible for the recap alone even after those are dismissed.
export function DataQualityBanner({
  issues,
  recap,
}: {
  issues: DataQualityIssue[];
  recap: RecapData | null;
}) {
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

  const issuesDismissed =
    dismissedSignature === "__unresolved__" || dismissedSignature === signature;
  const showIssues = active.length > 0 && !issuesDismissed;
  // Same reviewed-this-week check WeeklyRecapAlert uses internally to decide
  // whether to render its own trigger — needed here too so the bar doesn't
  // keep rendering an empty shell once the recap's already been reviewed and
  // there are no data-quality issues to show alongside it.
  const recapReviewed = useIsRecapReviewed(recap?.weekKey);
  const showRecap = !!recap && recapReviewed === false;

  // Held true for one beat after "Dismiss" so the issues content (and, if
  // nothing else is left to show, the whole bar) can fade out instead of
  // vanishing the instant it's clicked — the actual dismissedSignature
  // write is delayed to match, via the setTimeout below.
  const [dismissing, setDismissing] = useState(false);
  const issuesVisible = showIssues || dismissing;
  const barVisible = issuesVisible || showRecap;

  if (!barVisible) return null;

  function dismiss() {
    setDismissing(true);
    setTimeout(() => {
      try {
        localStorage.setItem(DISMISSED_KEY, signature);
      } catch {
        // ignore — localStorage unavailable
      }
      setDismissedSignature(signature);
      setDismissing(false);
    }, 150);
  }

  return (
    <div
      className={`animate-fade-in-up flex flex-wrap items-center gap-x-4 gap-y-2 overflow-hidden border-b border-caution-border bg-caution-bg px-4 text-sm text-caution-strong transition-[max-height,opacity,padding] duration-200 ease-in sm:px-6 lg:px-8 ${
        dismissing && !showRecap ? "max-h-0 py-0 opacity-0" : "max-h-20 py-2.5 opacity-100"
      }`}
    >
      {issuesVisible && (
        <span
          className={`flex shrink-0 items-center gap-1.5 font-medium transition-opacity duration-150 ${dismissing ? "opacity-0" : "opacity-100"}`}
        >
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
      )}
      <div className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-1">
        {issuesVisible && (
          <div
            className={`flex flex-wrap items-center gap-x-4 gap-y-1 transition-opacity duration-150 ${dismissing ? "opacity-0" : "opacity-100"}`}
          >
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
        )}
        <WeeklyRecapAlert data={recap} />
      </div>
      {issuesVisible && (
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className={`-my-1 flex size-7 shrink-0 items-center justify-center rounded-md text-caution-strong transition-[opacity,background-color] duration-150 hover:bg-caution-border ${
            dismissing ? "pointer-events-none opacity-0" : "opacity-100"
          }`}
        >
          ✕
        </button>
      )}
    </div>
  );
}
