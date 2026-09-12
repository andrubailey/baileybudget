// The one "AI-generated" mark in the app — the financial advisor's own
// icon, reused anywhere content actually came from it (the advisor panel
// itself, the Weekly Recap, which is generated the same way) so that
// association reads consistently rather than each surface inventing its
// own sparkle. Four-point star, hand-drawn on the same 24×24 grid the
// coolicons set uses, centered on both axes.
export const SPARKLE_PATH = "M12 5l1.8 5.2L19 12l-5.2 1.8L12 19l-1.8-5.2L5 12l5.2-1.8L12 5Z";

export function SparkleIcon({
  size = 18,
  strokeWidth = 1.6,
  className = "",
}: {
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d={SPARKLE_PATH} stroke="currentColor" strokeWidth={strokeWidth} strokeLinejoin="round" />
    </svg>
  );
}
