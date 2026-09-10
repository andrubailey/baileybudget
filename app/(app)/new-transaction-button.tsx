"use client";

import { useEffect, useRef, useState } from "react";
import { getQuickAddContext } from "@/app/actions";
import { QuickAddButton } from "./quick-add";
import { QuickAddTransferButton } from "./quick-add-transfer";
import type { Account, Category } from "@/lib/types";

type Context = { periodId: string | null; accounts: Account[]; categories: Category[] };
type Kind = "expense" | "income" | "transfer";
type PendingOpen = Kind | "picker";

const OPTIONS = [
  {
    key: "expense" as const,
    label: "Expense",
    shortcut: "E",
    icon: <path d="M5 12h14" strokeWidth={2} strokeLinecap="round" />,
    color: "var(--negative)",
  },
  {
    key: "income" as const,
    label: "Income",
    shortcut: "I",
    icon: <path d="M12 5v14M5 12h14" strokeWidth={2} strokeLinecap="round" />,
    color: "var(--positive)",
  },
  {
    key: "transfer" as const,
    label: "Transfer",
    shortcut: "T",
    icon: (
      <path
        d="M7 7h11l-3-3M17 17H6l3 3"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
    color: "var(--transfer)",
  },
];

// A single accent-colored entry point for logging a transaction, replacing
// the dashboard's row of separate "Add income / Add expense / Add transfer"
// cards — reachable from the sidebar on every page instead of only the
// dashboard. Reuses the existing quick-add forms via renderTrigger rather
// than rebuilding them, so duplicate-detection, splits, etc. all still work.
export function NewTransactionButton({
  collapsed,
  variant = "full",
  menuAlign = "left",
  menuPosition = "below",
  initialContext,
}: {
  collapsed?: boolean;
  // "icon" is a compact circular trigger for tight spaces (the mobile top
  // bar); "inline" is a content-width labeled button for sitting alongside
  // other controls in a header row, instead of the "full" variant's
  // full-width labeled button used in the sidebar. "hidden" renders no
  // trigger UI at all — just keeps the ⌥E/⌥I/⌥T listener and the modals
  // themselves mounted, for chrome that wants the shortcuts live without a
  // second visible "New transaction" button next to one that's already there.
  variant?: "full" | "icon" | "inline" | "hidden";
  menuAlign?: "left" | "right";
  // "above" for triggers anchored to the bottom of the screen, so the
  // picker doesn't try to open off the bottom edge of the viewport.
  menuPosition?: "above" | "below";
  // Skips the client-side getQuickAddContext() round trip entirely — pass
  // this when the page rendering this button already fetched periods/
  // accounts/categories server-side (most page-level usages). Left unset
  // for chrome (the sidebar's hidden instance) that has no server-rendered
  // data of its own to hand down — that case fetches lazily, below.
  initialContext?: Context;
}) {
  const [context, setContext] = useState<Context | null>(initialContext ?? null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const openers = useRef<Record<Kind, () => void>>({
    expense: () => {},
    income: () => {},
    transfer: () => {},
  });
  // Mirrors `context` for the window-event listener below, which is
  // registered once and would otherwise close over the initial (null) value.
  const contextRef = useRef(context);
  useEffect(() => {
    contextRef.current = context;
  }, [context]);
  const fetching = useRef(false);
  // What to open once a lazily-fetched context lands — a shortcut pressed
  // (or the trigger clicked) before the data is here shouldn't be dropped
  // on the floor, nor should it open the wrong thing.
  const pendingOpen = useRef<PendingOpen | null>(null);

  // No fetch on mount. The sidebar mounts a hidden instance of this on
  // every page purely to keep the shortcuts live, and fetching eagerly
  // meant every single page load paid for a periods + accounts + categories
  // round trip that's only ever needed the moment someone actually goes to
  // log something — which on most page views is never. Fetch on first use
  // instead, and only once.
  function ensureContext() {
    if (contextRef.current || fetching.current) return;
    fetching.current = true;
    getQuickAddContext()
      .then(setContext)
      .finally(() => {
        fetching.current = false;
      });
  }

  function open(target: PendingOpen) {
    if (contextRef.current?.periodId) {
      if (target === "picker") setPickerOpen(true);
      else openers.current[target]();
      return;
    }
    pendingOpen.current = target;
    ensureContext();
  }

  // Replays whatever was requested while the context was still loading.
  // Runs after commit, so the QuickAddButton children below have rendered
  // and populated `openers` by the time a specific kind is invoked.
  useEffect(() => {
    if (!context?.periodId || !pendingOpen.current) return;
    const target = pendingOpen.current;
    pendingOpen.current = null;
    if (target === "picker") setPickerOpen(true);
    else openers.current[target]();
  }, [context]);

  // Lets the global keyboard shortcuts (see GlobalShortcuts — "n" opens the
  // picker, ⌥E/⌥I/⌥T jump straight to a specific type) trigger this from
  // anywhere in the app, without the two components needing a shared parent
  // to coordinate through.
  useEffect(() => {
    function handleShortcut(e: Event) {
      const kind = (e as CustomEvent<{ kind?: Kind }>).detail?.kind;
      open(kind ?? "picker");
    }
    window.addEventListener("budgetapp:new-transaction", handleShortcut);
    return () => window.removeEventListener("budgetapp:new-transaction", handleShortcut);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `open` reads everything through refs, so the listener never goes stale and only needs registering once
  }, []);

  // A loaded context with no period means there's nothing to log into —
  // same degenerate state the old code hid the button for entirely.
  if (context && !context.periodId) return null;
  const ready = context !== null && context.periodId !== null;

  function togglePicker() {
    if (pickerOpen) setPickerOpen(false);
    else open("picker");
  }

  return (
    <div className="relative">
      {variant === "hidden" ? null : variant === "icon" ? (
        <button
          type="button"
          onClick={togglePicker}
          aria-label="New transaction"
          className="flex size-11 items-center justify-center rounded-lg bg-accent text-white transition-opacity hover:opacity-90"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
          </svg>
        </button>
      ) : variant === "inline" ? (
        <button
          type="button"
          onClick={togglePicker}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent/90"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
          </svg>
          New transaction
        </button>
      ) : (
        <button
          type="button"
          onClick={togglePicker}
          title={collapsed ? "New transaction" : undefined}
          className={`flex w-full items-center gap-3 rounded-lg bg-accent px-3 py-2.5 text-[15px] font-semibold text-white transition-opacity hover:opacity-90 ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="shrink-0">
            <path
              d="M12 5v14M5 12h14"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
            />
          </svg>
          {!collapsed && <span className="truncate">New transaction</span>}
        </button>
      )}

      {ready && pickerOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setPickerOpen(false)} />
          <div
            className={
              variant === "hidden"
                ? // No trigger button to anchor a corner dropdown to (this
                  // instance only exists to keep the shortcut listener and
                  // modals alive) — the "n" shortcut still needs somewhere
                  // sensible to show the picker, so it centers instead.
                  "animate-modal-panel fixed inset-0 z-50 m-auto flex h-fit w-48 flex-col gap-0.5 overflow-hidden self-center justify-self-center rounded-lg border border-border bg-surface py-1 shadow-modal"
                : `animate-modal-panel absolute z-50 flex w-48 flex-col gap-0.5 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-modal ${
                    menuAlign === "right" ? "right-0" : "left-0"
                  } ${menuPosition === "above" ? "bottom-full mb-2" : "top-full mt-2"}`
            }
          >
            {OPTIONS.map((o) => (
              <button
                key={o.key}
                type="button"
                onClick={() => {
                  setPickerOpen(false);
                  openers.current[o.key]();
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm font-medium text-text transition-colors hover:bg-bg"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={o.color}>
                  {o.icon}
                </svg>
                <span className="flex-1">{o.label}</span>
                <kbd className="rounded border border-border px-1 text-[10px] text-text-faint">
                  ⌥{o.shortcut}
                </kbd>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Invisible — these just hold the real forms/modals open for reuse.
          Only mounted once the context is in hand, since they need it. */}
      {ready && context && (
        <>
          <QuickAddButton
            kind="expense"
            periodId={context.periodId!}
            accounts={context.accounts}
            categories={context.categories}
            renderTrigger={(open) => {
              openers.current.expense = open;
              return null;
            }}
          />
          <QuickAddButton
            kind="income"
            periodId={context.periodId!}
            accounts={context.accounts}
            categories={context.categories}
            renderTrigger={(open) => {
              openers.current.income = open;
              return null;
            }}
          />
          <QuickAddTransferButton
            periodId={context.periodId!}
            accounts={context.accounts}
            renderTrigger={(open) => {
              openers.current.transfer = open;
              return null;
            }}
          />
        </>
      )}
    </div>
  );
}
