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

// Kept on this device, like the rest of this panel's state.
const CLEARED_KEY = "notifications-cleared-v1";
// Matches .animate-drawer-out (--duration-base) in globals.css.
const PANEL_EXIT_MS = 200;

type ClearedNotification = {
  // What the row said when it was cleared.
  text: string;
  href: string;
  clearedAt: string;
  // The count the notification is cleared up to: anything above it is new
  // and brings the notification back. Follows the live count down, so
  // fixing one and then gaining one counts as new.
  baseline: number;
};
type ClearedNotifications = Record<string, ClearedNotification>;

function readCleared(): ClearedNotifications {
  try {
    return JSON.parse(localStorage.getItem(CLEARED_KEY) ?? "{}");
  } catch {
    return {}; // localStorage unavailable or unreadable
  }
}

function writeCleared(cleared: ClearedNotifications) {
  try {
    localStorage.setItem(CLEARED_KEY, JSON.stringify(cleared));
  } catch {
    // ignore — localStorage unavailable
  }
}

const NotificationsContext = createContext<{ activeCount: number; open: () => void }>({
  activeCount: 0,
  open: () => {},
});

export function useNotifications() {
  return useContext(NotificationsContext);
}

// Mounted once in the shared layout: holds everything that needs attention,
// keeps the offline queue draining, and renders the notifications sidebar.
// The bell's count is everything still active: a notification stays until
// it's cleared here or its underlying issue is fixed, and a cleared one comes
// back if its count rises. Offline entries can't be cleared; they end when
// they send.
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
  const live = issues.filter((i) => i.count > 0);
  const liveSignature = live.map((i) => `${i.key}:${i.count}`).join("|");

  // Null until read after mount (no localStorage on the server), which also
  // keeps the bell count-free until hydration is done.
  const [cleared, setCleared] = useState<ClearedNotifications | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing with localStorage, an external system, after mount
    setCleared(readCleared());
  }, []);

  function saveCleared(next: ClearedNotifications) {
    writeCleared(next);
    setCleared(next);
  }

  // Lets a count that dropped and then rose again read as new.
  useEffect(() => {
    if (cleared === null) return;
    const counts = new Map(liveSignature.split("|").map((e) => e.split(":") as [string, string]));
    let changed = false;
    const next = { ...cleared };
    for (const [key, entry] of Object.entries(next)) {
      const count = Number(counts.get(key) ?? 0);
      if (count < entry.baseline) {
        next[key] = { ...entry, baseline: count };
        changed = true;
      }
    }
    if (!changed) return;
    writeCleared(next);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- only lowers baselines, so this settles after one pass
    setCleared(next);
  }, [cleared, liveSignature]);

  const activeIssues = live.filter((i) => i.count > (cleared?.[i.key]?.baseline ?? 0));
  const activeCount =
    cleared === null ? 0 : activeIssues.length + (weeklyRecap.ready ? 1 : 0) + (offline.count > 0 ? 1 : 0);

  const clearedRows = Object.entries(cleared ?? {})
    .filter(([key]) => !activeIssues.some((i) => i.key === key))
    .map(([key, entry]) => ({ key, ...entry, stillOpen: live.some((i) => i.key === key) }))
    .sort((a, b) => b.clearedAt.localeCompare(a.clearedAt));

  function clearIssues(toClear: NotificationIssue[]) {
    const clearedAt = new Date().toISOString();
    const next = { ...cleared };
    for (const issue of toClear) {
      next[issue.key] = {
        text: `${issue.count} ${issue.label}`,
        href: issue.href,
        clearedAt,
        baseline: issue.count,
      };
    }
    saveCleared(next);
  }

  function restoreIssue(key: string) {
    const next = { ...cleared };
    delete next[key];
    saveCleared(next);
  }

  return (
    <NotificationsContext.Provider value={{ activeCount, open: () => panel.open(true) }}>
      {children}
      {panel.value && (
        <NotificationsPanel
          issues={activeIssues}
          clearedRows={clearedRows}
          offline={offline}
          recap={
            recap && { label: recap.rangeShort, ready: weeklyRecap.ready, reviewed: weeklyRecap.reviewed }
          }
          closing={panel.closing}
          onClose={panel.close}
          onOpenRecap={() => {
            panel.close();
            weeklyRecap.openStory();
          }}
          onClearIssue={(issue) => clearIssues([issue])}
          onClearRecap={weeklyRecap.clear}
          onClearAll={() => {
            clearIssues(activeIssues);
            if (weeklyRecap.ready) weeklyRecap.clear();
          }}
          onRestoreIssue={restoreIssue}
          onRestoreRecap={weeklyRecap.restore}
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

const ICON_TONES = {
  caution: "bg-caution-bg text-caution-strong",
  accent: "bg-accent-soft text-accent",
  muted: "bg-(--bg-card-subtle) text-(--text-tertiary)",
};

function RowIcon({ children, tone = "caution" }: { children: React.ReactNode; tone?: keyof typeof ICON_TONES }) {
  return (
    <span className={`flex size-9 shrink-0 items-center justify-center rounded-(--radius-pill) ${ICON_TONES[tone]}`}>
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
  "ui-pressable flex min-h-(--space-8) min-w-0 flex-1 items-center gap-(--space-3) py-(--space-3) text-left";

// The row's own action, beside the tappable row rather than inside it.
function RowAction({ label, onPress, children }: { label: string; onPress: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={label}
      className="ui-pressable -mr-(--space-2) flex min-h-11 shrink-0 items-center rounded-(--radius-pill) px-(--space-2) text-(length:--text-caption) font-medium text-(--text-secondary)"
    >
      {children}
    </button>
  );
}

function clearedOn(iso: string) {
  return `Cleared ${new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

function FilterButton({
  selected,
  onPress,
  children,
}: {
  selected: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      aria-pressed={selected}
      className={`ui-pressable min-h-11 rounded-(--radius-pill) text-(length:--text-caption) font-medium ${
        selected ? "bg-(--bg-card) text-(--text-primary) shadow-card" : "text-(--text-secondary)"
      }`}
    >
      {children}
    </button>
  );
}

function NotificationsPanel({
  issues,
  clearedRows,
  offline,
  recap,
  closing,
  onClose,
  onOpenRecap,
  onClearIssue,
  onClearRecap,
  onClearAll,
  onRestoreIssue,
  onRestoreRecap,
}: {
  issues: NotificationIssue[];
  clearedRows: (ClearedNotification & { key: string; stillOpen: boolean })[];
  offline: { count: number; flushing: boolean };
  recap: { label: string; ready: boolean; reviewed: boolean } | null;
  closing: boolean;
  onClose: () => void;
  onOpenRecap: () => void;
  onClearIssue: (issue: NotificationIssue) => void;
  onClearRecap: () => void;
  onClearAll: () => void;
  onRestoreIssue: (key: string) => void;
  onRestoreRecap: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [filter, setFilter] = useState<"active" | "cleared">("active");
  const recapReady = recap?.ready === true;
  const recapCleared = recap?.reviewed === true;
  const clearableCount = issues.length + (recapReady ? 1 : 0);
  const activeTotal = clearableCount + (offline.count > 0 ? 1 : 0);
  const clearedTotal = clearedRows.length + (recapCleared ? 1 : 0);

  // The row a button sat in disappears when pressed, which would drop focus
  // out of the dialog and take Escape with it.
  function act(action: () => void) {
    action();
    closeRef.current?.focus({ preventScroll: true });
  }

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

        <div
          role="group"
          aria-label="Filter notifications"
          className="mx-(--space-4) mb-(--space-2) grid shrink-0 grid-cols-2 gap-(--space-1) rounded-(--radius-pill) bg-(--bg-card-subtle) p-(--space-1)"
        >
          <FilterButton selected={filter === "active"} onPress={() => setFilter("active")}>
            Active ({activeTotal})
          </FilterButton>
          <FilterButton selected={filter === "cleared"} onPress={() => setFilter("cleared")}>
            Cleared ({clearedTotal})
          </FilterButton>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-(--space-4) pb-(--space-4)">
          {filter === "active" && clearableCount > 1 && (
            <div className="flex justify-end">
              <RowAction label="Clear all notifications" onPress={() => act(onClearAll)}>
                Clear all
              </RowAction>
            </div>
          )}
          {filter === "active" && activeTotal === 0 && (
            <EmptyState compact icon="check" message="You're all caught up." />
          )}
          {filter === "cleared" && clearedTotal === 0 && (
            <EmptyState compact icon="check" message="Nothing cleared yet." />
          )}
          {filter === "active" && activeTotal > 0 && (
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
                <li key={issue.key} className="flex items-center gap-(--space-2)">
                  <Link href={issue.href} onClick={onClose} className={ROW_CLASS}>
                    <RowIcon>
                      <StrokeIcon>{ISSUE_ICONS[issue.key]}</StrokeIcon>
                    </RowIcon>
                    <span className="ui-body min-w-0 font-medium text-(--text-primary)">
                      {issue.count} {issue.label}
                    </span>
                  </Link>
                  <RowAction label={`Clear ${issue.count} ${issue.label}`} onPress={() => act(() => onClearIssue(issue))}>
                    Clear
                  </RowAction>
                </li>
              ))}
              {recapReady && (
                <li className="flex items-center gap-(--space-2)">
                  <button type="button" onClick={onOpenRecap} className={ROW_CLASS}>
                    <RowIcon tone="accent">
                      <SparkleIcon size={18} />
                    </RowIcon>
                    <span className="ui-body min-w-0 font-medium text-(--text-primary)">
                      Your weekly recap is ready
                    </span>
                  </button>
                  <RowAction label="Clear weekly recap" onPress={() => act(onClearRecap)}>
                    Clear
                  </RowAction>
                </li>
              )}
            </ul>
          )}
          {filter === "cleared" && clearedTotal > 0 && (
            <ul className="divide-y divide-(--border-subtle)">
              {clearedRows.map((row) => (
                <li key={row.key} className="flex items-center gap-(--space-2)">
                  <Link href={row.href} onClick={onClose} className={ROW_CLASS}>
                    <RowIcon tone="muted">
                      <StrokeIcon>{ISSUE_ICONS[row.key]}</StrokeIcon>
                    </RowIcon>
                    <span className="min-w-0">
                      <span className="ui-body block font-medium text-(--text-secondary)">{row.text}</span>
                      <span className="ui-caption block">
                        {clearedOn(row.clearedAt)}
                        {row.stillOpen ? "" : " · Resolved"}
                      </span>
                    </span>
                  </Link>
                  {row.stillOpen && (
                    <RowAction label={`Restore ${row.text}`} onPress={() => act(() => onRestoreIssue(row.key))}>
                      Restore
                    </RowAction>
                  )}
                </li>
              ))}
              {recapCleared && (
                <li className="flex items-center gap-(--space-2)">
                  <button type="button" onClick={onOpenRecap} className={ROW_CLASS}>
                    <RowIcon tone="muted">
                      <SparkleIcon size={18} />
                    </RowIcon>
                    <span className="ui-body min-w-0 font-medium text-(--text-secondary)">
                      Weekly recap, {recap?.label}
                    </span>
                  </button>
                  <RowAction label="Restore weekly recap" onPress={() => act(onRestoreRecap)}>
                    Restore
                  </RowAction>
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
