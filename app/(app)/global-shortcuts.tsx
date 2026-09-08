"use client";

import { useEffect } from "react";

const QUICK_ADD_SHORTCUTS: Record<string, "expense" | "income" | "transfer"> = {
  e: "expense",
  i: "income",
  t: "transfer",
};

// Global keyboard shortcuts, mounted once in the app layout so they're
// reachable from any page. ⌘K/Ctrl+K and "/" open the finances chat — which
// doubles as search, see FinancesChat's "Search"/"Ask AI" toggle — instead
// of a separate command-palette modal. Ignores every shortcut while focus is
// already inside a text field (⌘K still fires globally, matching a normal
// app-wide search shortcut), so it never fights with normal typing.
export function GlobalShortcuts() {
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
      const isChatShortcut = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      if (isChatShortcut) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("budgetapp:open-chat"));
        return;
      }
      if (isTypingTarget(e.target)) return;
      if (e.key === "/") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("budgetapp:open-chat"));
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
  }, []);

  return null;
}
