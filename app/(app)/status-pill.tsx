// Shared semantic badge so "over budget," "low balance," "achieved," etc.
// all read the same way instead of each component rolling its own
// red/amber/green styling inline.
const VARIANT_STYLES = {
  good: "bg-positive-bg text-positive-strong",
  warning: "bg-caution-bg text-caution-strong",
  danger: "bg-negative-bg text-negative-strong",
  neutral: "bg-bg text-text-faint",
  accent: "bg-accent-soft text-accent",
} as const;

export type StatusPillVariant = keyof typeof VARIANT_STYLES;

export function StatusPill({
  children,
  variant = "neutral",
  className = "",
}: {
  children: React.ReactNode;
  variant?: StatusPillVariant;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors duration-300 ${VARIANT_STYLES[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
