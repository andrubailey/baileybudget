"use client";

import { createContext, useCallback, useContext, useState } from "react";

type Toast = { id: number; message: string; tone: "success" | "error" };

const ToastContext = createContext<((message: string, tone?: Toast["tone"]) => void) | null>(
  null,
);

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, tone: Toast["tone"] = "success") => {
    const id = nextId++;
    setToasts((current) => [...current, { id, message, tone }]);
    setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {/* Sits above the mobile floating quick-add/chat buttons instead of
          overlapping them; desktop has no such stack, so it sits low there. */}
      <div className="pointer-events-none fixed right-4 bottom-40 z-[100] flex flex-col gap-2 sm:right-6 sm:bottom-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-toast-in pointer-events-auto flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium shadow-raised ${
              t.tone === "error"
                ? "border-[#fda29b] bg-[#fef3f2] text-[#b42318]"
                : "border-accent-border bg-accent-soft text-accent"
            }`}
          >
            {t.tone === "error" ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="shrink-0">
                <path
                  d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a1 1 0 0 0 .86 1.5h18.64a1 1 0 0 0 .86-1.5L13.71 3.86a1 1 0 0 0-1.72 0Z"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="shrink-0">
                <path
                  d="m4 12 6 6L20 6"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const showToast = useContext(ToastContext);
  if (!showToast) throw new Error("useToast must be used within a ToastProvider");
  return showToast;
}
