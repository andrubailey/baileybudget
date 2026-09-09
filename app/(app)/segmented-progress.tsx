// A row of thin vertical pills instead of one continuous bar — each segment
// represents an even slice of 100%, filling left to right as spend catches
// up to plan. Reads more like a step/level meter (battery bars, a loading
// dot row) than a generic progress bar, and each filled pill grows in with
// its own stagger so the fill visibly sweeps across instead of just
// appearing.
const SEGMENT_COUNT = 10;

export function SegmentedProgress({
  pct,
  overBudget,
  className = "",
}: {
  pct: number;
  overBudget: boolean;
  className?: string;
}) {
  const clamped = Math.min(100, Math.max(0, pct));
  const filledCount = Math.round((clamped / 100) * SEGMENT_COUNT);
  const color = overBudget ? "var(--negative)" : "var(--accent)";

  return (
    <div
      className={`flex h-3.5 items-stretch gap-[3px] ${className}`}
      role="img"
      aria-label={`${Math.round(clamped)}% of budget used`}
    >
      {Array.from({ length: SEGMENT_COUNT }, (_, i) => {
        const filled = i < filledCount;
        return (
          <div
            key={i}
            style={filled ? { backgroundColor: color, animationDelay: `${i * 45}ms` } : undefined}
            className={`min-w-0 flex-1 rounded-full transition-colors duration-300 ${
              filled ? "animate-bar-grow" : "bg-neutral-track"
            }`}
          />
        );
      })}
    </div>
  );
}
