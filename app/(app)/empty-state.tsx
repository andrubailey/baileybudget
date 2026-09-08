// One reusable empty state instead of ad-hoc "No X yet" text scattered
// across pages — a small line-art illustration + message + optional action,
// so first-run and filtered-to-nothing states read as designed, not default.
export function EmptyState({
  message,
  action,
}: {
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="animate-fade-in-up flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-10 text-center">
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" className="text-text-faint">
        <rect x="6" y="14" width="28" height="20" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M6 20h28" stroke="currentColor" strokeWidth="1.5" />
        <path d="M14 14V9a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v5" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="20" cy="27" r="3" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <p className="text-sm text-text-muted">{message}</p>
      {action}
    </div>
  );
}
