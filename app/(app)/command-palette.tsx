"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { searchTransactions } from "@/app/actions";
import type { TransactionSearchResult } from "@/lib/queries";
import { formatMoney, formatDate } from "@/lib/format";
import { NAV_GROUPS } from "./sidebar";

const ALL_LINKS = NAV_GROUPS.flatMap((g) => g.links);

const QUICK_ADD_SHORTCUTS: Record<string, "expense" | "income" | "transfer"> = {
  e: "expense",
  i: "income",
  t: "transfer",
};

type Match =
  | { type: "page"; href: string; label: string; icon: React.ReactNode }
  | { type: "transaction"; href: string; result: TransactionSearchResult };

// Global keyboard shortcuts + a ⌘K/Ctrl+K search palette. Mounted once in
// the app layout so it's reachable from any page. Searches both pages (by
// name) and every transaction ever logged (by description, notes, category,
// account, or exact amount) in one combined, keyboard-navigable list.
// Ignores every shortcut while focus is already inside a text field, so it
// never fights with normal typing.
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [txnResults, setTxnResults] = useState<TransactionSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchSeq = useRef(0);
  const router = useRouter();

  // Reset the search + selection whenever the palette opens or the query
  // changes, adjusted during render (React's recommended pattern for
  // deriving state off another value) rather than in an effect.
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setQuery("");
      setActiveIndex(0);
      setTxnResults([]);
    }
  }
  const [lastQuery, setLastQuery] = useState(query);
  if (query !== lastQuery) {
    setLastQuery(query);
    setActiveIndex(0);
  }

  const trimmed = query.trim();
  const pageMatches = ALL_LINKS.filter((link) =>
    link.label.toLowerCase().includes(trimmed.toLowerCase()),
  );

  // Debounced transaction search — fires ~250ms after typing stops, and a
  // sequence number discards any response that isn't from the latest
  // keystroke (a slow earlier search landing after a faster later one would
  // otherwise flash stale results back onto the screen).
  useEffect(() => {
    if (trimmed.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing stale results when the debounced search below no longer applies, not deriving render output
      setTxnResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const seq = ++searchSeq.current;
    const timer = setTimeout(async () => {
      const results = await searchTransactions(trimmed);
      if (searchSeq.current === seq) {
        setTxnResults(results);
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [trimmed]);

  const matches: Match[] = [
    ...pageMatches.map((link) => ({
      type: "page" as const,
      href: link.href,
      label: link.label,
      icon: link.icon,
    })),
    ...txnResults.map((result) => ({
      type: "transaction" as const,
      href: `/transactions?period=${result.period_id}&highlight=${result.id}`,
      result,
    })),
  ];

  function go(match: Match) {
    router.push(match.href);
    setOpen(false);
  }

  useEffect(() => {
    function isTypingTarget(el: EventTarget | null) {
      if (!(el instanceof HTMLElement)) return false;
      return (
        el.tagName === "INPUT" ||
        el.tagName === "TEXTAREA" ||
        el.tagName === "SELECT" ||
        el.isContentEditable
      );
    }

    function handleKeyDown(e: KeyboardEvent) {
      const isPaletteShortcut = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      if (isPaletteShortcut) {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (open) {
        if (e.key === "Escape") {
          e.preventDefault();
          setOpen(false);
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          setActiveIndex((i) => Math.min(i + 1, matches.length - 1));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setActiveIndex((i) => Math.max(i - 1, 0));
        } else if (e.key === "Enter") {
          e.preventDefault();
          const target = matches[activeIndex];
          if (target) go(target);
        }
        return;
      }
      if (isTypingTarget(e.target)) return;
      if (e.key === "/") {
        e.preventDefault();
        setOpen(true);
      } else if (e.key.toLowerCase() === "n" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("budgetapp:new-transaction"));
      } else if (
        (e.metaKey || e.ctrlKey) &&
        !e.altKey &&
        QUICK_ADD_SHORTCUTS[e.key.toLowerCase()]
      ) {
        // ⌘E/⌘I/⌘T (Ctrl on Windows/Linux) jump straight to a specific
        // transaction type instead of opening the picker first. Browsers
        // reserve ⌘T for "new tab" and will usually intercept it before
        // this ever runs — that one only works once the app is installed
        // as a standalone PWA with no tab chrome to compete with.
        e.preventDefault();
        window.dispatchEvent(
          new CustomEvent("budgetapp:new-transaction", {
            detail: { kind: QUICK_ADD_SHORTCUTS[e.key.toLowerCase()] },
          }),
        );
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `matches`/`go` are rebuilt every render; re-subscribing per keystroke would drop the listener mid-type
  }, [open, matches.length, activeIndex, router]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center bg-black/40 pt-[15vh]"
      onClick={() => setOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-modal-panel w-full max-w-lg overflow-hidden rounded-xl border border-border bg-surface shadow-modal"
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search pages or transactions…"
          className="w-full border-b border-border bg-transparent px-4 py-3 text-sm text-text outline-none transition-colors focus:border-accent placeholder:text-text-faint"
        />
        <div className="flex max-h-96 flex-col gap-0.5 overflow-y-auto p-1.5">
          {matches.length === 0 && !searching && (
            <p className="px-3 py-4 text-center text-sm text-text-faint">
              {trimmed ? "No matches." : "Type to search pages and transactions."}
            </p>
          )}

          {pageMatches.length > 0 && (
            <p className="px-3 pt-1.5 pb-0.5 text-[11px] font-semibold tracking-wide text-text-faint uppercase">
              Pages
            </p>
          )}
          {matches.map((match, i) => {
            if (match.type === "page") {
              return (
                <button
                  key={`page-${match.href}`}
                  type="button"
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => go(match)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                    i === activeIndex ? "bg-accent-soft text-accent" : "text-text hover:bg-bg"
                  }`}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="shrink-0">
                    {match.icon}
                  </svg>
                  {match.label}
                </button>
              );
            }

            const t = match.result;
            const isFirstTxn = i === pageMatches.length;
            return (
              <div key={`txn-${t.id}`}>
                {isFirstTxn && (
                  <p className="px-3 pt-2 pb-0.5 text-[11px] font-semibold tracking-wide text-text-faint uppercase">
                    Transactions
                  </p>
                )}
                <button
                  type="button"
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => go(match)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    i === activeIndex ? "bg-accent-soft" : "hover:bg-bg"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-text">{t.description}</p>
                    <p className="truncate text-xs text-text-faint">
                      {[t.category_name, t.account_name, formatDate(t.txn_date)]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <span
                    className={`tabular shrink-0 text-sm font-medium ${
                      t.kind === "income" ? "text-success" : "text-text"
                    }`}
                  >
                    {t.kind === "income" ? "+" : t.kind === "expense" ? "-" : ""}
                    {formatMoney(t.amount)}
                  </span>
                </button>
              </div>
            );
          })}

          {searching && (
            <p className="px-3 py-2 text-center text-xs text-text-faint">Searching transactions…</p>
          )}
        </div>
        <div className="border-t border-border px-4 py-2 text-xs text-text-faint">
          <kbd className="rounded border border-border px-1">↑↓</kbd> navigate{" "}
          <kbd className="rounded border border-border px-1">↵</kbd> open{" "}
          <kbd className="rounded border border-border px-1">esc</kbd> close
        </div>
      </div>
    </div>
  );
}
