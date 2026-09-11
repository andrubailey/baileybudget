"use client";

import { useEffect, useState } from "react";

type ThemeChoice = "system" | "light" | "dark";
const STORAGE_KEY = "theme";

function applyTheme(choice: ThemeChoice) {
  if (choice === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = choice;
}

const OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

// The one in-app override for dark mode — it otherwise just follows the OS
// preference (see app/globals.css). Persists to localStorage and applies
// instantly; app/layout.tsx's inline script re-applies the saved choice on
// every load before paint, so there's no flash of the wrong theme.
export function ThemeToggle() {
  // Starts on "system" (matching the server-rendered HTML) and reads the
  // saved choice after mount, to avoid a hydration mismatch — localStorage
  // isn't available during the server render.
  const [choice, setChoice] = useState<ThemeChoice>("system");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "light" || saved === "dark") {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing with localStorage, an external system, after mount
        setChoice(saved);
      }
    } catch {
      // ignore — localStorage unavailable
    }
  }, []);

  function choose(next: ThemeChoice) {
    setChoice(next);
    applyTheme(next);
    try {
      if (next === "system") localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }

  return (
    <div className="card">
      <h2 className="text-heading text-text">Appearance</h2>
      <p className="mt-1 text-sm text-text-muted">
        Choose light or dark, or follow your device&apos;s setting.
      </p>
      <div className="mt-4 inline-flex rounded-lg border border-border p-1">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => choose(o.value)}
            aria-pressed={choice === o.value}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              choice === o.value
                ? "bg-accent text-white"
                : "text-text-muted hover:text-text"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent("budgetapp:open-shortcuts"))}
        className="mt-4 text-sm font-medium text-text-muted underline decoration-border underline-offset-4 transition-colors hover:text-text"
      >
        View keyboard shortcuts
      </button>
    </div>
  );
}
