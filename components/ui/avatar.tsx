// Single letter in a circle, for attributing a row to one of you.
export function Avatar({
  initial,
  label,
  size = "md",
}: {
  initial: string;
  // Full name for screen readers, e.g. "Added by Andru".
  label?: string;
  size?: "sm" | "md";
}) {
  const letter = initial.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={`inline-flex shrink-0 items-center justify-center rounded-(--radius-pill) bg-(--bg-card-subtle) font-semibold text-(--text-primary) ${
        size === "sm" ? "size-(--space-6) text-(length:--text-label)" : "size-(--space-7) text-(length:--text-caption)"
      }`}
    >
      {letter}
    </span>
  );
}
