// One reusable empty state instead of ad-hoc "No X yet" text scattered
// across pages — a small line-art illustration + message + optional action,
// so first-run and filtered-to-nothing states read as designed, not default.
// Every empty state should tell the reader what to do next: pass `action`
// for a link/button, or `shortcut` to point at a keyboard shortcut.
export function EmptyState({
  message,
  action,
  shortcut,
  compact = false,
  icon = "list",
}: {
  message: string;
  action?: React.ReactNode;
  // e.g. { keys: ["⌥", "E"], label: "to log an expense" }
  shortcut?: { keys: string[]; label: string };
  // Less vertical padding, for a card that's sitting next to a full one.
  compact?: boolean;
  icon?: "list" | "chart" | "wallet" | "check";
}) {
  return (
    <div
      className={`animate-fade-in-up flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-center ${
        compact ? "px-4 py-6" : "px-4 py-10"
      }`}
    >
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" className="text-text-faint">
        {icon === "list" && (
          <>
            <rect x="6" y="14" width="28" height="20" rx="2" stroke="currentColor" strokeWidth="1.5" />
            <path d="M6 20h28" stroke="currentColor" strokeWidth="1.5" />
            <path d="M14 14V9a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v5" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="20" cy="27" r="3" stroke="currentColor" strokeWidth="1.5" />
          </>
        )}
        {icon === "chart" && (
          <>
            <path d="M7 33h26" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M9 27l7-8 6 5 9-11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}
        {icon === "wallet" && (
          <>
            <rect x="6" y="12" width="28" height="20" rx="3" stroke="currentColor" strokeWidth="1.5" />
            <path d="M6 18h28" stroke="currentColor" strokeWidth="1.5" />
            <rect x="24" y="22" width="7" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
          </>
        )}
        {icon === "check" && (
          <>
            <circle cx="20" cy="20" r="13" stroke="currentColor" strokeWidth="1.5" />
            <path d="M14 20.5l4 4 8-9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}
      </svg>
      <p className="text-sm text-text-muted">{message}</p>
      {shortcut && (
        <p className="flex items-center gap-1 text-xs text-text-faint">
          {shortcut.keys.map((k) => (
            <kbd
              key={k}
              className="rounded border border-border bg-surface px-1.5 py-0.5 font-sans text-[11px] text-text-muted"
            >
              {k}
            </kbd>
          ))}
          <span className="ml-1">{shortcut.label}</span>
        </p>
      )}
      {action}
    </div>
  );
}
