export type StatusTone = "positive" | "caution" | "neutral";

const TONES: Record<StatusTone, string> = {
  positive: "bg-positive-bg text-positive-strong",
  caution: "bg-caution-bg text-caution-strong",
  neutral: "bg-(--bg-card-subtle) text-(--text-secondary)",
};

// Soft background, small text.
export function StatusPill({ tone = "neutral", children }: { tone?: StatusTone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-(--radius-pill) px-(--space-2) py-(--space-1) text-(length:--text-label) leading-none font-semibold whitespace-nowrap ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}
