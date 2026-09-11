"use client";

import { useEffect } from "react";

// Keyed by e.code (the physical key), not e.key — on a Mac, Option+E/I/T
// type dead-key/special characters ("´", "ˆ", "†") rather than the letter
// itself, so matching the printed character would silently break these on
// exactly the platform where Option-as-modifier is the natural choice.
const QUICK_ADD_SHORTCUTS: Record<string, "expense" | "income" | "transfer"> = {
  KeyE: "expense",
  KeyI: "income",
  KeyT: "transfer",
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
      } else if (e.key === "?") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("budgetapp:open-shortcuts"));
      } else if (e.key.toLowerCase() === "n" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("budgetapp:new-transaction"));
      } else if (
        e.altKey &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.shiftKey &&
        QUICK_ADD_SHORTCUTS[e.code]
      ) {
        // Option+E/I/T (Alt on Windows/Linux) jump straight to a specific
        // transaction type instead of opening the picker first.
        e.preventDefault();
        window.dispatchEvent(
          new CustomEvent("budgetapp:new-transaction", {
            detail: { kind: QUICK_ADD_SHORTCUTS[e.code] },
          }),
        );
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return null;
}
