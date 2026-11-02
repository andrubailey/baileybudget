"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EmptyState } from "@/app/(app)/empty-state";
import { SparkleIcon } from "@/app/(app)/sparkle-icon";
import { useExitingPanel } from "@/app/(app)/use-exiting-panel";
import { useOfflineQueueSync } from "@/app/(app)/use-offline-queue-sync";
import { useWeeklyRecap } from "@/app/(app)/weekly-recap-alert";
import type { RecapData } from "@/app/(app)/weekly-recap-card";

export type NotificationIssue = {
  key: string;
  count: number;
  label: string;
  href: string;
};

// Same key and "key:count|key:count" format the old top bar's dismiss used,
// so anything already dismissed there stays seen.
const SEEN_KEY = "data-quality-banner-dismissed";
// Matches .animate-drawer-out (--duration-base) in globals.css.
const PANEL_EXIT_MS = 200;

function parseSeen(stored: string | null) {
  const seen = new Map<string, number>();
  for (const entry of (stored ?? "").split("|")) {
    const [key, count] = entry.split(":");
    if (key) seen.set(key, Number(count) || 0);
  }
  return seen;
}

const NotificationsContext = createContext<{ unseenCount: number; open: () => void }>({
  unseenCount: 0,
  open: () => {},
});

export function useNotifications() {
  return useContext(NotificationsContext);
}

// Mounted once in the shared layout: holds everything that needs attention,
// keeps the offline queue draining, and renders the notifications sidebar.
// The bell's count is what's new since the sidebar was last opened: a count
// going up brings it back, one going down doesn't. Offline entries and an
// unreviewed recap count until they're actually resolved.
export function NotificationsProvider({
  issues,
  recap,
  children,
}: {
  issues: NotificationIssue[];
  recap: RecapData | null;
  children: React.ReactNode;
}) {
  const offline = useOfflineQueueSync();
  const weeklyRecap = useWeeklyRecap(recap);
  const panel = useExitingPanel<true>(PANEL_EXIT_MS);
  const active = issues.filter((i) => i.count > 0);

  // Null until read after mount (no localStorage on the server), which also
  // keeps the bell count-free until hydration is done.
  const [seen, setSeen] = useState<Map<string, number> | null>(null);
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(SEEN_KEY);
    } catch {
      // ignore — localStorage unavailable
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing with localStorage, an external system, after mount
    setSeen(parseSeen(stored));
  }, []);

  const unseenCount =
    seen === null
      ? 0
      : active.filter((i) => i.count > (seen.get(i.key) ?? 0)).length +
        (weeklyRecap.ready ? 1 : 0) +
        (offline.count > 0 ? 1 : 0);

  function open() {
    const signature = active.map((i) => `${i.key}:${i.count}`).join("|");
    try {
      localStorage.setItem(SEEN_KEY, signature);
    } catch {
      // ignore — localStorage unavailable
    }
    setSeen(parseSeen(signature));
    panel.open(true);
  }

  return (
    <NotificationsContext.Provider value={{ unseenCount, open }}>
      {children}
      {panel.value && (
        <NotificationsPanel
          issues={active}
          offline={offline}
          recapReady={weeklyRecap.ready}
          closing={panel.closing}
          onClose={panel.close}
          onOpenRecap={() => {
            panel.close();
            weeklyRecap.openStory();
          }}
        />
      )}
      {weeklyRecap.story}
    </NotificationsContext.Provider>
  );
}

const ISSUE_ICONS: Record<string, React.ReactNode> = {
  uncategorized: <path d="M3 12V4h8l10 10-8 8L3 12ZM8 9h.01" />,
  pending: <path d="M12 7v5l3 3M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />,
  "bills-due": <path d="M3 10h18M8 3v4M16 3v4M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />,
  "low-balance": <path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a1 1 0 0 0 .86 1.5h18.64a1 1 0 0 0 .86-1.5L13.71 3.86a1 1 0 0 0-1.72 0Z" />,
};

function RowIcon({ children, tone = "caution" }: { children: React.ReactNode; tone?: "caution" | "accent" }) {
  return (
    <span
      className={`flex size-9 shrink-0 items-center justify-center rounded-(--radius-pill) ${
        tone === "caution" ? "bg-caution-bg text-caution-strong" : "bg-accent-soft text-accent"
      }`}
    >
      {children}
    </span>
  );
}

function StrokeIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const ROW_CLASS =
  "ui-pressable flex min-h-(--space-8) w-full items-center gap-(--space-3) py-(--space-3) text-left";

function Chevron() {
  return (
    <span className="ml-auto shrink-0 text-(--text-tertiary)">
      <StrokeIcon>
        <path d="m9 6 6 6-6 6" />
      </StrokeIcon>
    </span>
  );
}

function NotificationsPanel({
  issues,
  offline,
  recapReady,
  closing,
  onClose,
  onOpenRecap,
}: {
  issues: NotificationIssue[];
  offline: { count: number; flushing: boolean };
  recapReady: boolean;
  closing: boolean;
  onClose: () => void;
  onOpenRecap: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const empty = issues.length === 0 && offline.count === 0 && !recapReady;

  // Move focus in, hand it back on close, and lock the page behind.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus({ preventScroll: true });
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previousOverflow;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-50 outline-none"
      role="dialog"
      aria-modal="true"
      aria-label="Notifications"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        className={`absolute inset-0 bg-black/40 ${closing ? "animate-modal-backdrop-out" : "animate-modal-backdrop"}`}
        onClick={onClose}
      />
      <aside
        className={`absolute inset-y-0 right-0 flex w-[min(24rem,calc(100vw-var(--space-8)))] flex-col bg-(--bg-card) shadow-modal ${
          closing ? "animate-drawer-out" : "animate-drawer-in"
        }`}
        style={{
          paddingTop: "env(safe-area-inset-top)",
          paddingRight: "env(safe-area-inset-right)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div className="flex shrink-0 items-center justify-between gap-(--space-3) py-(--space-2) pr-(--space-2) pl-(--space-4)">
          <h2 className="ui-body font-semibold text-(--text-primary)">Notifications</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ui-pressable flex size-11 items-center justify-center rounded-(--radius-pill) text-(--text-secondary)"
          >
            <StrokeIcon>
              <path d="M6 6l12 12M18 6 6 18" />
            </StrokeIcon>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-(--space-4) pb-(--space-4)">
          {empty ? (
            <EmptyState compact icon="check" message="You're all caught up." />
          ) : (
            <ul className="divide-y divide-(--border-subtle)">
              {offline.count > 0 && (
                <li role="status" className="flex items-center gap-(--space-3) py-(--space-3)">
                  <RowIcon>
                    <StrokeIcon>
                      <path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4" />
                    </StrokeIcon>
                  </RowIcon>
                  <span className="min-w-0">
                    <span className="ui-body block font-medium text-(--text-primary)">
                      {offline.flushing ? "Sending " : ""}
                      {offline.count} queued {offline.count === 1 ? "entry" : "entries"}
                    </span>
                    {!offline.flushing && (
                      <span className="ui-caption block">Waiting for a connection. Will send automatically.</span>
                    )}
                  </span>
                </li>
              )}
              {issues.map((issue) => (
                <li key={issue.key}>
                  <Link href={issue.href} onClick={onClose} className={ROW_CLASS}>
                    <RowIcon>
                      <StrokeIcon>{ISSUE_ICONS[issue.key]}</StrokeIcon>
                    </RowIcon>
                    <span className="ui-body min-w-0 font-medium text-(--text-primary)">
                      {issue.count} {issue.label}
                    </span>
                    <Chevron />
                  </Link>
                </li>
              ))}
              {recapReady && (
                <li>
                  <button type="button" onClick={onOpenRecap} className={ROW_CLASS}>
                    <RowIcon tone="accent">
                      <SparkleIcon size={18} />
                    </RowIcon>
                    <span className="ui-body min-w-0 font-medium text-(--text-primary)">
                      Your weekly recap is ready
                    </span>
                    <Chevron />
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  );
}
