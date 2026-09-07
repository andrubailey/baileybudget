"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type DisplayMessage = { role: "user" | "assistant"; text: string };

// Minimal shape of the Web Speech API, which TypeScript's DOM lib doesn't
// ship types for since it's still non-standard (Chrome/Safari only, under
// vendor prefixes in some versions).
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: { [i: number]: { [j: number]: { transcript: string } } } }) => void) | null;
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
  const [listening, setListening] = useState(false);
  const apiState = useRef<unknown[]>([]);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const speechSupported = getSpeechRecognition() !== null;

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

  // Speak a transaction instead of typing it — "$12 at the coffee shop" said
  // out loud while walking out of a store, transcribed and sent straight
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
      if (transcript) {
        setOpen(true);
        sendMessage(transcript);
      }
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

  return (
    <div className="fixed right-4 bottom-4 z-40 sm:right-5 sm:bottom-5">
      {open && (
        <div className="mb-3 flex h-[min(480px,70vh)] w-[calc(100vw-2rem)] max-w-[360px] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-modal">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-sm font-semibold text-text">Budget assistant</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="-mr-1.5 flex size-9 shrink-0 items-center justify-center rounded-lg text-text-faint hover:bg-bg hover:text-text"
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
                {listening ? "Listening…" : "Thinking…"}
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
            {speechSupported && (
              <button
                type="button"
                onClick={listening ? stopVoiceInput : startVoiceInput}
                aria-label={listening ? "Stop voice input" : "Log by voice"}
                title={listening ? "Stop voice input" : "Log by voice"}
                className={`flex size-11 shrink-0 items-center justify-center rounded-lg ${
                  listening ? "bg-[#f04438] text-white" : "border border-border text-text-muted hover:bg-bg"
                }`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
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
        className="flex size-14 items-center justify-center rounded-full bg-accent text-white shadow-raised transition-transform hover:scale-105"
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
