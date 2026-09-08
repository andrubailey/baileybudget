"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import { searchTransactions } from "@/app/actions";
import type { TransactionSearchResult } from "@/lib/queries";
import { formatMoney, formatDate } from "@/lib/format";
import { getLetterColors } from "@/lib/letter-colors";
import { NAV_GROUPS } from "./sidebar";

type DisplayMessage = { role: "user" | "assistant"; text: string };

const ALL_LINKS = NAV_GROUPS.flatMap((g) => g.links);

type Match =
  | { type: "page"; href: string; label: string; icon: React.ReactNode }
  | { type: "transaction"; href: string; result: TransactionSearchResult };

const COLLAPSE_KEY = "finances-chat-collapsed";
const WIDTH_KEY = "finances-chat-width";
const MODE_KEY = "finances-chat-mode";
const DEFAULT_WIDTH = 384;
const MIN_WIDTH = 300;
const MAX_WIDTH = 640;

const DOCK_ICON_PATH = "M4 4h16v16H4V4Zm11.5 0v16";

const WELCOME: DisplayMessage = {
  role: "assistant",
  text: 'Tell me what happened and I\'ll log it — one at a time or a whole batch at once. e.g. "Publix $64.20 today, Chick-fil-A $8.75 yesterday, paycheck $2100 on Friday, and transfer $200 from Checking to Savings."',
};

const CHAT_ICON_PATH =
  "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8-1.297 0-2.53-.242-3.643-.677L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8Z";

// Minimal shape of the Web Speech API, which TypeScript's DOM lib doesn't
// ship types for since it's still non-standard (Chrome/Safari only, under
// vendor prefixes in some versions).
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult:
    | ((e: {
        results: { [i: number]: { [j: number]: { transcript: string } } };
      }) => void)
    | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function ChatMessages({
  messages,
  loading,
  listening,
  scrollRef,
}: {
  messages: DisplayMessage[];
  loading: boolean;
  listening: boolean;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
      {messages.map((m, i) => (
        <div
          key={i}
          className={`max-w-[90%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
            m.role === "user" ? "ml-auto bg-accent text-white" : "bg-bg text-text"
          }`}
        >
          {m.text}
        </div>
      ))}
      {loading && (
        <div className="max-w-[90%] rounded-lg bg-bg px-3 py-2 text-sm text-text-muted">
          {listening ? "Listening…" : "Logging…"}
        </div>
      )}
    </div>
  );
}

// The small "press Enter to go" affordance on the right of every row —
// mirrors the browser's own ⌘K tab switcher (icon left, label, a hint +
// arrow chip right) instead of a bare text row.
function GoArrow() {
  return (
    <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-text-faint">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
        <path
          d="M5 12h14M13 6l6 6-6 6"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

// Renders inline where ChatMessages normally goes, swapped in whenever the
// "Search" toggle is active — a live, keyboard-navigable list of matching
// pages and transactions instead of the conversation thread, so the one
// panel serves both purposes without a second modal.
function SearchResults({
  matches,
  pageMatchCount,
  activeIndex,
  setActiveIndex,
  searching,
  trimmed,
  onSelect,
}: {
  matches: Match[];
  pageMatchCount: number;
  activeIndex: number;
  setActiveIndex: (i: number) => void;
  searching: boolean;
  trimmed: string;
  onSelect: (match: Match) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-2">
      {matches.length === 0 && !searching && (
        <p className="px-3 py-4 text-center text-sm text-text-faint">
          {trimmed ? "No matches." : "Type to search pages and transactions."}
        </p>
      )}

      {pageMatchCount > 0 && (
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
              onClick={() => onSelect(match)}
              className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left text-sm font-medium transition-colors ${
                i === activeIndex ? "bg-accent-soft text-accent" : "text-text hover:bg-bg"
              }`}
            >
              <span
                className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${
                  i === activeIndex ? "bg-surface" : "bg-bg"
                }`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  {match.icon}
                </svg>
              </span>
              <span className="min-w-0 flex-1 truncate">{match.label}</span>
              <span className="hidden shrink-0 items-center gap-2 sm:flex">
                <span className="text-xs font-normal text-text-faint">Go to page</span>
                <GoArrow />
              </span>
            </button>
          );
        }

        const t = match.result;
        const isFirstTxn = i === pageMatchCount;
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
              onClick={() => onSelect(match)}
              className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left text-sm transition-colors ${
                i === activeIndex ? "bg-accent-soft" : "hover:bg-bg"
              }`}
            >
              <span
                className="flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                style={{
                  backgroundColor: getLetterColors(t.description).bg,
                  color: getLetterColors(t.description).text,
                }}
              >
                {t.description.trim()[0]?.toUpperCase() ?? "?"}
              </span>
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
              <span className="hidden shrink-0 sm:flex">
                <GoArrow />
              </span>
            </button>
          </div>
        );
      })}

      {searching && (
        <p className="px-3 py-2 text-center text-xs text-text-faint">Searching transactions…</p>
      )}
    </div>
  );
}

function ChatInputForm({
  input,
  setInput,
  loading,
  listening,
  speechSupported,
  queryKind,
  onSetQueryKind,
  onSend,
  onToggleVoice,
  onSearchKeyDown,
  inputRef,
  position = "bottom",
}: {
  input: string;
  setInput: (v: string) => void;
  loading: boolean;
  listening: boolean;
  speechSupported: boolean;
  queryKind: "ai" | "search";
  onSetQueryKind: (k: "ai" | "search") => void;
  onSend: (e: React.FormEvent) => void;
  onToggleVoice: () => void;
  onSearchKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => boolean;
  inputRef?: (el: HTMLTextAreaElement | null) => void;
  // "top" — a Spotlight/⌘K-style search bar leading the panel (used for
  // Search, the default mode). "bottom" — the usual chat-input position,
  // anchored near the newest message (used once "Ask AI" is picked).
  position?: "top" | "bottom";
}) {
  const isSearching = input.trim().length > 0;
  return (
    <form
      onSubmit={onSend}
      className={`flex shrink-0 flex-col gap-2 p-3 ${
        position === "top" ? "border-b border-border" : "border-t border-border"
      }`}
    >
      {isSearching && (
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => onSetQueryKind("ai")}
            className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
              queryKind === "ai" ? "bg-accent text-white" : "bg-bg text-text-muted hover:text-text"
            }`}
          >
            ✨ Ask AI
          </button>
          <button
            type="button"
            onClick={() => onSetQueryKind("search")}
            className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
              queryKind === "search"
                ? "bg-accent text-white"
                : "bg-bg text-text-muted hover:text-text"
            }`}
          >
            🔍 Search
          </button>
        </div>
      )}
      <div className="relative">
        {position === "top" && queryKind === "search" && (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-faint"
          >
            <path
              d="m21 21-4.34-4.34M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (queryKind === "search" && onSearchKeyDown(e)) return;
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend(e);
            }
          }}
          rows={position === "top" && queryKind === "search" ? 1 : 2}
          placeholder={
            queryKind === "search" ? "Search pages or transactions…" : "Log a batch of transactions…"
          }
          className={`w-full resize-none rounded-lg border border-border bg-bg py-2 text-base text-text outline-none focus:border-accent sm:text-sm ${
            position === "top" && queryKind === "search" ? "pr-3 pl-9" : "px-3"
          }`}
        />
      </div>
      {queryKind === "ai" && (
        <div className="flex justify-end gap-2">
          {speechSupported && (
            <button
              type="button"
              onClick={onToggleVoice}
              aria-label={listening ? "Stop voice input" : "Log by voice"}
              title={listening ? "Stop voice input" : "Log by voice"}
              className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${
                listening
                  ? "bg-negative text-white"
                  : "border border-border text-text-muted hover:bg-bg"
              }`}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0M12 19v2"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      )}
    </form>
  );
}

// The household's one place to dump a batch of income/expenses/transfers in
// plain language (typed, pasted, or spoken) instead of filling out the
// transaction form once per line item. Defaults to a floating chat bubble on
// desktop — a small anchored popup instead of permanently eating screen
// width — with an option inside it to switch to the old always-visible
// right-docked sidebar instead, for whoever prefers that. On mobile (where
// there's no room for either) the same chat opens as a full-screen sheet.
export function FinancesChat() {
  const router = useRouter();
  // Starts in the default state (matching the server-rendered HTML) and
  // reads the saved preference after mount, to avoid a hydration mismatch —
  // same pattern as the left sidebar's own collapse state.
  const [mode, setMode] = useState<"popup" | "sidebar">("popup");
  const [popupOpen, setPopupOpen] = useState(false);
  // Closing plays the reverse of the open animation before the panel
  // actually unmounts — without this it would just vanish instantly, since
  // conditionally rendering it away gives CSS nothing left to animate.
  const [popupClosing, setPopupClosing] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [resizing, setResizing] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [messages, setMessages] = useState<DisplayMessage[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  // Whether the current draft is meant to log/ask the AI assistant or to
  // search pages/transactions — the toggle that appears once typing starts.
  // Starts as "search" — ⌘K should open a plain search bar, not the AI chat,
  // until the person explicitly picks "Ask AI" below.
  const [queryKind, setQueryKind] = useState<"ai" | "search">("search");
  const [txnResults, setTxnResults] = useState<TransactionSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const apiState = useRef<unknown[]>([]);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const mobileScrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const searchSeq = useRef(0);
  const speechSupported = getSpeechRecognition() !== null;

  const trimmedInput = input.trim();
  // The desktop popup starts as just a bare search bar (Spotlight-style) and
  // grows to reveal results once there's something to show them for —
  // either a query typed, or the AI conversation (which always needs the
  // full height once picked). Height, not max-height, is what's animated:
  // a max-height transition on a flex-col with min-h-0 children still lets
  // the browser's default intrinsic sizing jump instantly, whereas a fixed
  // height on both ends is what actually tweens smoothly.
  const searchExpanded = queryKind === "ai" || trimmedInput.length > 0;
  // Every link's label vacuously matches an empty query — without the length
  // guard, opening ⌘K on a blank input dumped the entire sidebar nav as
  // "results" instead of the empty, type-to-search state (Spotlight/Arc's
  // ⌘T both start blank and only populate once you type).
  const pageMatches =
    queryKind === "search" && trimmedInput.length > 0
      ? ALL_LINKS.filter((link) => link.label.toLowerCase().includes(trimmedInput.toLowerCase()))
      : [];
  const matches: Match[] =
    queryKind === "search"
      ? [
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
        ]
      : [];

  // Reset the active selection whenever the draft or mode changes, adjusted
  // during render (React's recommended pattern for deriving state off
  // another value) rather than in an effect.
  const [lastSearchKey, setLastSearchKey] = useState(`${queryKind}:${trimmedInput}`);
  const searchKey = `${queryKind}:${trimmedInput}`;
  if (searchKey !== lastSearchKey) {
    setLastSearchKey(searchKey);
    setActiveIndex(0);
  }

  // Debounced transaction search — fires ~250ms after typing stops, and a
  // sequence number discards any response that isn't from the latest
  // keystroke.
  useEffect(() => {
    if (queryKind !== "search" || trimmedInput.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing stale results when the debounced search below no longer applies, not deriving render output
      setTxnResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const seq = ++searchSeq.current;
    const timer = setTimeout(async () => {
      const results = await searchTransactions(trimmedInput);
      if (searchSeq.current === seq) {
        setTxnResults(results);
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [queryKind, trimmedInput]);

  function go(match: Match) {
    router.push(match.href);
    setInput("");
    setTxnResults([]);
    setQueryKind("ai");
    if (mode === "popup" && popupOpen) closePopup();
    setMobileOpen(false);
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>): boolean {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, matches.length - 1));
      return true;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
      return true;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const target = matches[activeIndex];
      if (target) go(target);
      return true;
    }
    return false;
  }

  useEffect(() => {
    try {
      const saved = localStorage.getItem(COLLAPSE_KEY) === "1";
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing with localStorage, an external system, after mount
      setCollapsed(saved);
    } catch {
      // ignore — localStorage unavailable
    }
    try {
      const savedWidth = Number(localStorage.getItem(WIDTH_KEY));
      if (savedWidth >= MIN_WIDTH && savedWidth <= MAX_WIDTH) {
        setWidth(savedWidth);
      }
    } catch {
      // ignore — localStorage unavailable
    }
    try {
      const savedMode = localStorage.getItem(MODE_KEY);
      if (savedMode === "sidebar") {
        setMode("sidebar");
      }
    } catch {
      // ignore — localStorage unavailable
    }
  }, []);

  // ⌘K / "/" (see GlobalShortcuts) opens this same panel and focuses it —
  // it doubles as the app's search, so there's no separate palette to open.
  // Each fresh open lands on Search first (not the AI chat) — the toggle
  // that appears once typing starts is what actually picks "Ask AI" — unless
  // there's already an AI conversation in progress (more than the initial
  // welcome message), in which case reopening continues it instead of
  // bouncing back to search.
  useEffect(() => {
    function handleOpenChat() {
      if (messages.length <= 1) setQueryKind("search");
      // flushSync forces the panel/sheet's DOM to actually commit before
      // this function continues — a plain setState + requestAnimationFrame
      // raced React's own commit here, so the textarea sometimes wasn't in
      // the document yet when .focus() ran and the keystroke that opened
      // ⌘K would land nowhere until you clicked in first.
      if (window.innerWidth < 1024) {
        flushSync(() => setMobileOpen(true));
      } else if (mode === "popup") {
        flushSync(() => setPopupOpen(true));
      } else if (collapsed) {
        flushSync(() => toggle());
      }
      inputRef.current?.focus();
    }
    window.addEventListener("budgetapp:open-chat", handleOpenChat);
    return () => window.removeEventListener("budgetapp:open-chat", handleOpenChat);
  }, [mode, collapsed, messages.length]);

  function setModeAndPersist(next: "popup" | "sidebar") {
    setMode(next);
    // Switching from the sidebar to the popup would otherwise leave nothing
    // on screen until the bubble is clicked — open the popup right away so
    // the switch feels like a continuation, not a dead end.
    if (next === "popup") setPopupOpen(true);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      // ignore
    }
  }

  function closePopup() {
    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      setPopupOpen(false);
      return;
    }
    setPopupClosing(true);
    setTimeout(() => {
      setPopupOpen(false);
      setPopupClosing(false);
    }, 150);
  }

  // Drag-to-resize — panel is right-docked, so dragging the handle left
  // (negative clientX movement) grows it and dragging right shrinks it.
  useEffect(() => {
    if (!resizing) return;

    function handleMove(e: MouseEvent) {
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, window.innerWidth - e.clientX));
      setWidth(next);
    }
    function handleUp() {
      setResizing(false);
      setWidth((current) => {
        try {
          localStorage.setItem(WIDTH_KEY, String(current));
        } catch {
          // ignore
        }
        return current;
      });
    }

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [resizing]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    mobileScrollRef.current?.scrollTo({ top: mobileScrollRef.current.scrollHeight });
  }, [messages, loading]);

  // Lock body scroll behind the full-screen mobile sheet, same pattern the
  // mobile nav drawer already uses.
  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileOpen]);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }

  async function sendMessage(text: string) {
    if (!text || loading) return;

    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, state: apiState.current }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMessages((m) => [
          ...m,
          { role: "assistant", text: data.error ?? "Something went wrong." },
        ]);
        return;
      }

      apiState.current = data.state ?? [];
      setMessages((m) => [...m, { role: "assistant", text: data.reply }]);

      if (data.loggedCount > 0) {
        router.refresh();
      }
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: "Couldn't reach the assistant — try again." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    await sendMessage(input.trim());
  }

  // Speak a batch instead of typing it — transcribed and sent straight
  // through the same natural-language parser as typed messages.
  function startVoiceInput() {
    const SpeechRecognitionCtor = getSpeechRecognition();
    if (!SpeechRecognitionCtor || listening) return;

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (e) => {
      const transcript = e.results[0]?.[0]?.transcript;
      if (transcript) sendMessage(transcript);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  function stopVoiceInput() {
    recognitionRef.current?.stop();
    setListening(false);
  }

  function toggleVoice() {
    if (listening) stopVoiceInput();
    else startVoiceInput();
  }

  return (
    <>
      {/* Desktop, popup mode (default): opens as a centered modal — like any
          other command palette — instead of a bubble anchored bottom-right.
          There's no floating trigger button; it only appears via ⌘K, "/", or
          the sidebar search field's ghost ⌘K badge, and always lands on
          Search first. The chat conversation itself only shows once "Ask AI"
          is picked in the input form below. */}
      {mode === "popup" && (popupOpen || popupClosing) && (
        <div
          className={`fixed inset-0 z-50 hidden items-start justify-center bg-black/40 p-4 pt-[12vh] lg:flex ${
            popupClosing ? "animate-modal-backdrop-out" : "animate-modal-backdrop"
          }`}
          onClick={closePopup}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ height: searchExpanded ? "min(560px, 70vh)" : "128px" }}
            className={`flex w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-modal transition-[height] duration-300 ease-out ${
              popupClosing ? "animate-modal-panel-out" : "animate-modal-panel"
            }`}
          >
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path
                      d={CHAT_ICON_PATH}
                      stroke="currentColor"
                      strokeWidth={1.6}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <p className="truncate text-sm font-semibold text-text">Finances chat</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => setModeAndPersist("sidebar")}
                  title="Switch to sidebar"
                  aria-label="Switch to sidebar"
                  className="flex size-8 shrink-0 items-center justify-center rounded-md text-text-faint transition-colors hover:bg-bg hover:text-text"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path
                      d={DOCK_ICON_PATH}
                      stroke="currentColor"
                      strokeWidth={1.6}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={closePopup}
                  title="Close"
                  aria-label="Close finances chat"
                  className="flex size-8 shrink-0 items-center justify-center rounded-md text-text-faint transition-colors hover:bg-bg hover:text-text"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M6 6l12 12M18 6 6 18"
                      stroke="currentColor"
                      strokeWidth={1.8}
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>
            </div>

            {queryKind === "search" && (
              <ChatInputForm
                input={input}
                setInput={setInput}
                loading={loading}
                listening={listening}
                speechSupported={speechSupported}
                queryKind={queryKind}
                onSetQueryKind={setQueryKind}
                onSend={handleSend}
                onToggleVoice={toggleVoice}
                onSearchKeyDown={handleSearchKeyDown}
                position="top"
                inputRef={(el) => {
                  inputRef.current = el;
                }}
              />
            )}
            {queryKind === "search" ? (
              <div
                className={`flex min-h-0 flex-1 flex-col transition-opacity duration-200 ${
                  searchExpanded ? "opacity-100" : "opacity-0"
                }`}
              >
                <SearchResults
                  matches={matches}
                  pageMatchCount={pageMatches.length}
                  activeIndex={activeIndex}
                  setActiveIndex={setActiveIndex}
                  searching={searching}
                  trimmed={trimmedInput}
                  onSelect={go}
                />
              </div>
            ) : (
              <>
                <ChatMessages
                  messages={messages}
                  loading={loading}
                  listening={listening}
                  scrollRef={scrollRef}
                />
                <ChatInputForm
                  input={input}
                  setInput={setInput}
                  loading={loading}
                  listening={listening}
                  speechSupported={speechSupported}
                  queryKind={queryKind}
                  onSetQueryKind={setQueryKind}
                  onSend={handleSend}
                  onToggleVoice={toggleVoice}
                  onSearchKeyDown={handleSearchKeyDown}
                  inputRef={(el) => {
                    inputRef.current = el;
                  }}
                />
              </>
            )}
          </div>
        </div>
      )}

      {/* Desktop, sidebar mode: persistent right-docked column, collapsible
          + resizable — the original layout, opt-in from the popup's header. */}
      {mode === "sidebar" && (collapsed ? (
        <div className="sticky top-0 hidden h-screen w-14 shrink-0 flex-col items-center border-l border-border bg-surface py-4 lg:flex">
          <button
            type="button"
            onClick={toggle}
            title="Open finances chat"
            aria-label="Open finances chat"
            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-bg hover:text-text"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d={CHAT_ICON_PATH}
                stroke="currentColor"
                strokeWidth={1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      ) : (
        <div
          style={{ width }}
          className={`sticky top-0 hidden h-screen shrink-0 flex-col border-l border-border bg-surface lg:flex ${
            resizing ? "" : "transition-[width] duration-150"
          }`}
        >
          {/* Drag left/right to resize — mirrors the sidebar's own collapse
              affordance but continuous instead of a fixed expanded/collapsed
              width, since chat transcripts benefit from more room than a
              toggle between two presets would give. */}
          <div
            onMouseDown={(e) => {
              e.preventDefault();
              setResizing(true);
            }}
            onKeyDown={(e) => {
              // Left/right arrows mirror what dragging left/right does —
              // left grows the panel (it's docked on the right edge), right
              // shrinks it — so this is keyboard-operable too, not just
              // draggable with a mouse.
              const step = e.shiftKey ? 32 : 16;
              if (e.key === "ArrowLeft") {
                e.preventDefault();
                setWidth((current) => Math.min(MAX_WIDTH, current + step));
              } else if (e.key === "ArrowRight") {
                e.preventDefault();
                setWidth((current) => Math.max(MIN_WIDTH, current - step));
              }
            }}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize finances chat"
            aria-valuemin={MIN_WIDTH}
            aria-valuemax={MAX_WIDTH}
            aria-valuenow={width}
            tabIndex={0}
            className="absolute inset-y-0 left-0 z-10 w-1.5 -translate-x-1/2 cursor-col-resize touch-none hover:bg-accent-border focus-visible:bg-accent active:bg-accent"
          />
          <div className="flex h-[72px] shrink-0 items-center justify-between border-b border-border px-4">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path
                    d={CHAT_ICON_PATH}
                    stroke="currentColor"
                    strokeWidth={1.6}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <p className="truncate text-sm font-semibold text-text">Finances chat</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setModeAndPersist("popup")}
                title="Switch to popup"
                aria-label="Switch to popup"
                className="flex size-8 shrink-0 items-center justify-center rounded-md text-text-faint transition-colors hover:bg-bg hover:text-text"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path
                    d={CHAT_ICON_PATH}
                    stroke="currentColor"
                    strokeWidth={1.6}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <button
                type="button"
                onClick={toggle}
                title="Collapse"
                aria-label="Collapse finances chat"
                className="flex size-8 shrink-0 items-center justify-center rounded-md text-text-faint transition-colors hover:bg-bg hover:text-text"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M9 5l7 7-7 7"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          </div>

          {queryKind === "search" && (
            <ChatInputForm
              input={input}
              setInput={setInput}
              loading={loading}
              listening={listening}
              speechSupported={speechSupported}
              queryKind={queryKind}
              onSetQueryKind={setQueryKind}
              onSend={handleSend}
              onToggleVoice={toggleVoice}
              onSearchKeyDown={handleSearchKeyDown}
              position="top"
              inputRef={(el) => {
                inputRef.current = el;
              }}
            />
          )}
          {queryKind === "search" ? (
            <SearchResults
              matches={matches}
              pageMatchCount={pageMatches.length}
              activeIndex={activeIndex}
              setActiveIndex={setActiveIndex}
              searching={searching}
              trimmed={trimmedInput}
              onSelect={go}
            />
          ) : (
            <>
              <ChatMessages
                messages={messages}
                loading={loading}
                listening={listening}
                scrollRef={scrollRef}
              />
              <ChatInputForm
                input={input}
                setInput={setInput}
                loading={loading}
                listening={listening}
                speechSupported={speechSupported}
                queryKind={queryKind}
                onSetQueryKind={setQueryKind}
                onSend={handleSend}
                onToggleVoice={toggleVoice}
                onSearchKeyDown={handleSearchKeyDown}
                inputRef={(el) => {
                  inputRef.current = el;
                }}
              />
            </>
          )}
        </div>
      ))}

      {/* Mobile: no room for a permanent column, so a floating button opens
          the same chat as a full-screen sheet instead. Sits just above the
          bottom tab bar. */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="Open finances chat"
        className="fixed right-4 bottom-20 z-40 flex size-14 items-center justify-center rounded-full bg-accent text-white shadow-raised transition-transform duration-150 active:scale-95 lg:hidden"
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path
            d={CHAT_ICON_PATH}
            stroke="white"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-surface lg:hidden">
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
            <p className="text-base font-semibold text-text">Finances chat</p>
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Close finances chat"
              className="flex size-11 items-center justify-center rounded-lg text-text-faint transition-colors hover:bg-bg hover:text-text"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path
                  d="M6 6l12 12M18 6 6 18"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>

          {queryKind === "search" && (
            <ChatInputForm
              input={input}
              setInput={setInput}
              loading={loading}
              listening={listening}
              speechSupported={speechSupported}
              queryKind={queryKind}
              onSetQueryKind={setQueryKind}
              onSend={handleSend}
              onToggleVoice={toggleVoice}
              onSearchKeyDown={handleSearchKeyDown}
              position="top"
              inputRef={(el) => {
                inputRef.current = el;
              }}
            />
          )}
          {queryKind === "search" ? (
            <SearchResults
              matches={matches}
              pageMatchCount={pageMatches.length}
              activeIndex={activeIndex}
              setActiveIndex={setActiveIndex}
              searching={searching}
              trimmed={trimmedInput}
              onSelect={go}
            />
          ) : (
            <>
              <ChatMessages
                messages={messages}
                loading={loading}
                listening={listening}
                scrollRef={mobileScrollRef}
              />
              <ChatInputForm
                input={input}
                setInput={setInput}
                loading={loading}
                listening={listening}
                speechSupported={speechSupported}
                queryKind={queryKind}
                onSetQueryKind={setQueryKind}
                onSend={handleSend}
                onToggleVoice={toggleVoice}
                onSearchKeyDown={handleSearchKeyDown}
                inputRef={(el) => {
                  inputRef.current = el;
                }}
              />
            </>
          )}
        </div>
      )}
    </>
  );
}
