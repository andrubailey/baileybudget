"use client";

import { useEffect, useState } from "react";

const GROUPS: { label: string; items: { keys: string[]; description: string }[] }[] = [
  {
    label: "Navigate",
    items: [
      { keys: ["⌥", "1"], description: "Overview" },
      { keys: ["⌥", "2"], description: "Accounts" },
      { keys: ["⌥", "3"], description: "Spending" },
      { keys: ["⌥", "4"], description: "Budget" },
      { keys: ["⌥", "5"], description: "Goals" },
      { keys: ["⌥", "6"], description: "Reports" },
      { keys: ["⌥", "7"], description: "Settings" },
    ],
  },
  {
    label: "Log a transaction",
    items: [
      { keys: ["N"], description: "Open the new transaction picker" },
      { keys: ["⌥", "E"], description: "New expense" },
      { keys: ["⌥", "I"], description: "New income" },
      { keys: ["⌥", "T"], description: "New transfer" },
    ],
  },
  {
    label: "Search & help",
    items: [
      { keys: ["⌘", "K"], description: "Search / ask the AI Advisor" },
      { keys: ["/"], description: "Same as ⌘K" },
      { keys: ["?"], description: "Show this list" },
    ],
  },
];

function KeyCap({ children }: { children: string }) {
  return (
    <kbd className="flex min-w-[1.75rem] items-center justify-center rounded-md border border-border bg-bg px-1.5 py-1 text-xs font-medium text-text">
      {children}
    </kbd>
  );
}

// Reference for every global keyboard shortcut — opened via "?" (see
// GlobalShortcuts) or the account menu's "Keyboard shortcuts" item, the
// same open-via-custom-event pattern FinancesChat uses for ⌘K. Nothing in
// the app documented these anywhere before this.
export function ShortcutsModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function handleOpen() {
      setOpen(true);
    }
    window.addEventListener("budgetapp:open-shortcuts", handleOpen);
    return () => window.removeEventListener("budgetapp:open-shortcuts", handleOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="animate-modal-backdrop fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4"
      onClick={() => setOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        className="animate-modal-panel w-full max-w-md overflow-hidden rounded-xl border border-border bg-surface shadow-modal"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-heading text-text">Keyboard shortcuts</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="flex size-8 items-center justify-center rounded-lg text-text-faint transition-colors hover:bg-bg hover:text-text"
          >
            ✕
          </button>
        </div>
        <div className="max-h-[70vh] space-y-5 overflow-y-auto p-5">
          {GROUPS.map((group) => (
            <div key={group.label}>
              <p className="text-section-label mb-2">{group.label}</p>
              <ul className="space-y-2">
                {group.items.map((item) => (
                  <li
                    key={item.description}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="text-text-muted">{item.description}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      {item.keys.map((k) => (
                        <KeyCap key={k}>{k}</KeyCap>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
