"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type DisplayMessage = { role: "user" | "assistant"; text: string };

export function AssistantWidget() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<DisplayMessage[]>([
    {
      role: "assistant",
      text: "Tell me about a transaction and I'll log it — e.g. \"$42 at Publix yesterday\" or \"paycheck, $2100, today\".",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const apiState = useRef<unknown[]>([]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
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

  return (
    <div className="fixed right-4 bottom-4 z-40 sm:right-5 sm:bottom-5">
      {open && (
        <div className="mb-3 flex h-[min(480px,70vh)] w-[calc(100vw-2rem)] max-w-[360px] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-sm font-semibold text-text">Budget assistant</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-text-faint hover:text-text"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  m.role === "user"
                    ? "ml-auto bg-accent text-white"
                    : "bg-bg text-text"
                }`}
              >
                {m.text}
              </div>
            ))}
            {loading && (
              <div className="max-w-[85%] rounded-lg bg-bg px-3 py-2 text-sm text-text-muted">
                Thinking…
              </div>
            )}
          </div>

          <form onSubmit={handleSend} className="flex gap-2 border-t border-border p-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Log a transaction…"
              className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent"
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex size-14 items-center justify-center rounded-full bg-accent text-white shadow-lg transition-transform hover:scale-105"
        aria-label="Toggle budget assistant"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8-1.297 0-2.53-.242-3.643-.677L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8Z"
            stroke="white"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}
