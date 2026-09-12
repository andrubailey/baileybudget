"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import { searchTransactions } from "@/app/actions";
import type { TransactionSearchResult } from "@/lib/queries";
import { formatDate } from "@/lib/format";
import { TransactionAmount, TransactionAvatar } from "@/app/(app)/transaction-row";
import { SPARKLE_PATH } from "@/app/(app)/sparkle-icon";
import { NAV_GROUPS } from "./sidebar";

type DisplayMessage = { role: "user" | "assistant"; text: string };

const ALL_LINKS = NAV_GROUPS.flatMap((g) => g.links);

type Match =
  | { type: "page"; href: string; label: string; icon: React.ReactNode }
  | { type: "transaction"; href: string; result: TransactionSearchResult };

const CHAT_ICON_PATH =
  "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8-1.297 0-2.53-.242-3.643-.677L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8Z";

const SUGGESTIONS = [
  "How much have I spent this month?",
  "Am I over budget anywhere?",
  "What's my net worth right now?",
  "How does this month compare to last month?",
];

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

// Renders `**bold**` spans inside one line of assistant text.
function renderInline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.length > 4 && part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="font-semibold text-text">
        {part.slice(2, -2)}
      </strong>
    ) : (
      part
    ),
  );
}

// A small, safe subset of markdown for assistant answers — "#" headings,
// "-"/"1." lists, **bold**, and paragraphs — built as React elements rather
// than injected HTML, so nothing the model writes can run as markup.
function RichText({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  const pending: { list: { ordered: boolean; items: string[] } | null } = { list: null };

  const flushList = () => {
    const list = pending.list;
    if (!list) return;
    const items = list.items.map((item, i) => <li key={i}>{renderInline(item)}</li>);
    blocks.push(
      list.ordered ? (
        <ol key={blocks.length} className="ml-5 list-decimal space-y-1">
          {items}
        </ol>
      ) : (
        <ul key={blocks.length} className="ml-5 list-disc space-y-1">
          {items}
        </ul>
      ),
    );
    pending.list = null;
  };

  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      const ordered = !bullet;
      if (pending.list && pending.list.ordered !== ordered) flushList();
      if (!pending.list) pending.list = { ordered, items: [] };
      pending.list.items.push((bullet ?? numbered)![1]);
      continue;
    }
    flushList();
    if (!line.trim()) continue;
    const heading = line.match(/^#{1,4}\s+(.*)$/);
    if (heading) {
      blocks.push(
        <h3 key={blocks.length} className="pt-2 text-base font-semibold text-text">
          {renderInline(heading[1])}
        </h3>,
      );
      continue;
    }
    blocks.push(<p key={blocks.length}>{renderInline(line)}</p>);
  }
  flushList();

  return <div className="space-y-2.5 text-sm leading-relaxed text-text-muted">{blocks}</div>;
}

// Renders inline inside the same scrollable feed as the conversation — a
// live, keyboard-navigable list of matching pages and transactions for
// whatever's currently typed. It appears while there's a draft and
// disappears once it's cleared or sent.
function InlineResults({
  matches,
  pageMatchCount,
  activeIndex,
  setActiveIndex,
  searching,
  onSelect,
}: {
  matches: Match[];
  pageMatchCount: number;
  activeIndex: number;
  setActiveIndex: (i: number) => void;
  searching: boolean;
  onSelect: (match: Match) => void;
}) {
  return (
    <div className="flex flex-col gap-0.5 border-t border-border px-2 pt-2 pb-2">
      {pageMatchCount > 0 && (
        <p className="px-3 pt-1 pb-0.5 text-[11px] font-semibold tracking-wide text-text-faint uppercase">
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
              <TransactionAvatar label={t.description} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-text">{t.description}</p>
                <p className="text-metadata truncate">
                  {[t.category_name, t.account_name, formatDate(t.txn_date)]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <TransactionAmount
                amount={t.amount}
                presentation={{
                  sign: t.kind === "income" ? "+" : t.kind === "expense" ? "-" : "none",
                  tone: t.kind === "income" ? "positive" : "neutral",
                }}
              />
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
      {!searching && matches.length === 0 && (
        <p className="px-3 py-2.5 text-center text-xs text-text-faint">
          No matching pages or transactions. Press Enter to ask the advisor instead.
        </p>
      )}
    </div>
  );
}

// The scrollable conversation shared by every layout: a welcome with
// suggested questions when empty, then the back-and-forth (your questions as
// small pills, answers as formatted text), with live search results for the
// current draft underneath.
function AdvisorFeed({
  messages,
  thinking,
  listening,
  scrollRef,
  trimmedInput,
  matches,
  pageMatchCount,
  activeIndex,
  setActiveIndex,
  searching,
  onSelectMatch,
  onSuggestion,
  compact = false,
}: {
  messages: DisplayMessage[];
  thinking: boolean;
  listening: boolean;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  trimmedInput: string;
  matches: Match[];
  pageMatchCount: number;
  activeIndex: number;
  setActiveIndex: (i: number) => void;
  searching: boolean;
  onSelectMatch: (match: Match) => void;
  onSuggestion: (text: string) => void;
  compact?: boolean;
}) {
  const showWelcome = messages.length === 0 && trimmedInput.length === 0 && !thinking;
  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
      <div className={compact ? "px-4 py-4" : "mx-auto max-w-2xl px-6 py-6"}>
        {showWelcome && (
          <div className={`flex flex-col items-center text-center ${compact ? "py-6" : "pt-14 pb-4"}`}>
            <span className="flex size-10 items-center justify-center rounded-full bg-accent-soft text-accent">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d={SPARKLE_PATH} stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" />
              </svg>
            </span>
            <p
              className={`mt-4 font-semibold tracking-tight text-text ${compact ? "text-base" : "text-2xl"}`}
            >
              Your AI financial advisor
            </p>
            <p className="mt-1.5 max-w-sm text-sm text-text-muted">
              Ask about your spending, budget, and balances, or tell me what happened and I&apos;ll
              log it.
            </p>
            <div className="mt-6 flex max-w-lg flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onSuggestion(s)}
                  className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:border-accent hover:text-text"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-5">
          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <p className="max-w-[80%] rounded-2xl bg-bg px-4 py-2 text-sm whitespace-pre-wrap text-text">
                  {m.text}
                </p>
              </div>
            ) : (
              <RichText key={i} text={m.text} />
            ),
          )}
          {(thinking || listening) && (
            <p className="flex items-center gap-2 text-sm text-text-faint">
              <span className="size-1.5 animate-pulse rounded-full bg-accent" />
              {listening ? "Listening…" : "Thinking…"}
            </p>
          )}
        </div>
      </div>

      {trimmedInput.length > 0 && (
        <div className={compact ? "" : "mx-auto max-w-2xl px-4"}>
          <InlineResults
            matches={matches}
            pageMatchCount={pageMatchCount}
            activeIndex={activeIndex}
            setActiveIndex={setActiveIndex}
            searching={searching}
            onSelect={onSelectMatch}
          />
        </div>
      )}
    </div>
  );
}

// The "Ask anything" bar pinned under the conversation. Enter jumps to a
// highlighted search result if there is one, otherwise asks the advisor;
// the send button always asks the advisor.
function AdvisorInput({
  input,
  setInput,
  busy,
  listening,
  speechSupported,
  onSend,
  onToggleVoice,
  onKeyDown,
  inputRef,
  compact = false,
}: {
  input: string;
  setInput: (v: string) => void;
  busy: boolean;
  listening: boolean;
  speechSupported: boolean;
  onSend: (e: React.FormEvent) => void;
  onToggleVoice: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  inputRef?: (el: HTMLTextAreaElement | null) => void;
  compact?: boolean;
}) {
  return (
    <form
      onSubmit={onSend}
      className={`shrink-0 ${compact ? "border-t border-border p-3" : "px-6 pt-2 pb-5"}`}
    >
      <div className={compact ? "" : "mx-auto max-w-2xl"}>
        <div className="flex items-end gap-2 rounded-xl border border-border bg-surface p-2 shadow-card transition-colors focus-within:border-accent">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Ask anything or search…"
            className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-base text-text outline-none placeholder:text-text-faint sm:text-sm"
          />
          {speechSupported && (
            <button
              type="button"
              onClick={onToggleVoice}
              aria-label={listening ? "Stop voice input" : "Speak instead"}
              title={listening ? "Stop voice input" : "Speak instead"}
              className={`flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors ${
                listening ? "bg-negative text-white" : "text-text-muted hover:bg-bg"
              }`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
            disabled={busy || !input.trim()}
            aria-label="Ask the advisor"
            className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M12 19V5M5 12l7-7 7 7"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
        {!compact && (
          <p className="mt-2 text-center text-[11px] text-text-faint">
            Answers come from your budget data and aren&apos;t financial advice.
          </p>
        )}
      </div>
    </form>
  );
}

// The AI Advisor — one place to search pages and transactions, ask questions
// about the household's money, and add/change/remove things (transactions,
// goals, accounts, categories, budget amounts) in plain language (typed,
// pasted, or spoken). ⌘K opens it as a large centered modal. On mobile it
// opens as a full-screen sheet. One conversation at a time — no chat
// history to browse, "New chat" just clears it.
export function FinancesChat() {
  const router = useRouter();
  const [popupOpen, setPopupOpen] = useState(false);
  // Closing plays the reverse of the open animation before the panel
  // actually unmounts — without this it would just vanish instantly, since
  // conditionally rendering it away gives CSS nothing left to animate.
  const [popupClosing, setPopupClosing] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const [txnResults, setTxnResults] = useState<TransactionSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  // Starts false (matching the server-rendered HTML, which has no way to
  // know what the browser supports) and is set after mount, to avoid a
  // hydration mismatch — the real check runs a render too late otherwise.
  const [speechSupported, setSpeechSupported] = useState(false);
  const apiState = useRef<unknown[]>([]);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const mobileScrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const searchSeq = useRef(0);

  const busy = loading;
  const thinking = loading;

  const trimmedInput = input.trim();
  // Every link's label vacuously matches an empty query — without the length
  // guard, opening ⌘K on a blank input dumped the entire nav as results.
  const pageMatches =
    trimmedInput.length > 0
      ? ALL_LINKS.filter((link) => link.label.toLowerCase().includes(trimmedInput.toLowerCase()))
      : [];
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

  // Reset the active selection whenever the draft changes, adjusted during
  // render (React's recommended pattern for deriving state off another
  // value) rather than in an effect.
  const [lastTrimmedInput, setLastTrimmedInput] = useState(trimmedInput);
  if (trimmedInput !== lastTrimmedInput) {
    setLastTrimmedInput(trimmedInput);
    setActiveIndex(0);
  }

  // Debounced transaction search — fires ~250ms after typing stops, and a
  // sequence number discards any response that isn't from the latest
  // keystroke.
  useEffect(() => {
    if (trimmedInput.length < 2) {
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
  }, [trimmedInput]);

  function go(match: Match) {
    router.push(match.href);
    setInput("");
    setTxnResults([]);
    if (popupOpen) {
      closePopup();
    } else if (mobileOpen) {
      setMobileOpen(false);
      resetConversation();
    }
  }

  // Called wherever the on-screen conversation should clear: the Advisor
  // actually closing/hiding (popup close, mobile sheet close), or the
  // explicit "New chat" button. There's only ever one conversation — no
  // history to file away, so this always just wipes it.
  function resetConversation() {
    setMessages([]);
    setInput("");
    setTxnResults([]);
    setSearching(false);
    setActiveIndex(0);
    apiState.current = [];
  }

  // Enter is the one "do the obvious thing" key: jump to whatever result is
  // highlighted if there is one, otherwise ask the advisor. Arrow keys move
  // the highlight when there's a list to move it through.
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (matches.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, matches.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const target = matches[activeIndex];
      if (target) {
        go(target);
        return;
      }
      handleSend(e);
    }
  }

  // The real feature check needs `window`, so it can't run during the
  // server render — this fills it in right after mount instead.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time browser feature detection, not derived from props/state
    setSpeechSupported(getSpeechRecognition() !== null);
  }, []);

  // ⌘K / "/" (see GlobalShortcuts) opens the Advisor and focuses its input.
  useEffect(() => {
    function handleOpenChat() {
      // flushSync forces the panel/sheet's DOM to actually commit before
      // this function continues — a plain setState + requestAnimationFrame
      // raced React's own commit here, so the textarea sometimes wasn't in
      // the document yet when .focus() ran and the keystroke that opened
      // ⌘K would land nowhere until you clicked in first.
      if (window.innerWidth < 1024) {
        flushSync(() => setMobileOpen(true));
      } else {
        flushSync(() => setPopupOpen(true));
      }
      inputRef.current?.focus();
    }
    window.addEventListener("budgetapp:open-chat", handleOpenChat);
    return () => window.removeEventListener("budgetapp:open-chat", handleOpenChat);
  }, []);

  function closePopup() {
    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      setPopupOpen(false);
      resetConversation();
      return;
    }
    setPopupClosing(true);
    setTimeout(() => {
      setPopupOpen(false);
      setPopupClosing(false);
      resetConversation();
    }, 150);
  }


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

  function appendMessage(message: DisplayMessage, nextState?: unknown[]) {
    setMessages((m) => [...m, message]);
    if (nextState) apiState.current = nextState;
  }

  async function sendMessage(text: string) {
    if (!text || busy) return;

    const priorState = apiState.current;
    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");
    setTxnResults([]);
    setLoading(true);

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, state: priorState }),
      });
      const data = await res.json();

      if (!res.ok) {
        appendMessage({ role: "assistant", text: data.error ?? "Something went wrong." });
        return;
      }

      appendMessage({ role: "assistant", text: data.reply }, data.state ?? []);

      if (data.changedCount > 0) {
        router.refresh();
      }
    } catch {
      appendMessage({
        role: "assistant",
        text: "Couldn't reach the advisor. Try again.",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    await sendMessage(input.trim());
  }

  // Speak a question or a batch instead of typing it — transcribed and sent
  // straight through the same advisor as typed messages.
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

  const feedProps = {
    messages,
    thinking,
    listening,
    trimmedInput,
    matches,
    pageMatchCount: pageMatches.length,
    activeIndex,
    setActiveIndex,
    searching,
    onSelectMatch: go,
    onSuggestion: sendMessage,
  };
  const inputProps = {
    input,
    setInput,
    busy,
    listening,
    speechSupported,
    onSend: handleSend,
    onToggleVoice: toggleVoice,
    onKeyDown: handleKeyDown,
    inputRef: (el: HTMLTextAreaElement | null) => {
      inputRef.current = el;
    },
  };

  return (
    <>
      {/* Desktop: a large centered modal opened via ⌘K, "/", or the dock's
          search button. Fixed height, so it never resizes itself as content
          changes. */}
      {(popupOpen || popupClosing) && (
        <div
          className={`fixed inset-0 z-50 hidden items-center justify-center bg-black/40 p-6 lg:flex ${
            popupClosing ? "animate-modal-backdrop-out" : "animate-modal-backdrop"
          }`}
          onClick={closePopup}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="AI Advisor"
            className={`flex h-[min(760px,88vh)] w-full max-w-5xl overflow-hidden rounded-2xl border border-border bg-surface shadow-modal ${
              popupClosing ? "animate-modal-panel-out" : "animate-modal-panel"
            }`}
          >
            <section className="flex min-w-0 flex-1 flex-col">
              <div className="flex h-12 shrink-0 items-center justify-between gap-1 border-b border-border px-3">
                <p className="card-label text-text-muted">AI Advisor</p>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={closePopup}
                    title="Close"
                    aria-label="Close AI Advisor"
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

              <AdvisorFeed {...feedProps} scrollRef={scrollRef} />
              <AdvisorInput {...inputProps} />
            </section>
          </div>
        </div>
      )}

      {/* Mobile: no room for a permanent column, so a floating button opens
          the Advisor as a full-screen sheet instead. Sits just above the
          bottom tab bar. */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="Open AI Advisor"
        className="fixed right-4 bottom-24 z-40 flex size-14 items-center justify-center rounded-full bg-accent text-white shadow-raised transition-transform duration-150 active:scale-95 lg:hidden"
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
            <p className="card-label text-text-muted">AI Advisor</p>
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                resetConversation();
              }}
              aria-label="Close AI Advisor"
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

          <AdvisorFeed {...feedProps} scrollRef={mobileScrollRef} compact />
          <AdvisorInput {...inputProps} compact />
        </div>
      )}
    </>
  );
}
