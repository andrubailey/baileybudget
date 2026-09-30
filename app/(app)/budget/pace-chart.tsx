// Small line chart for the Money hero: cumulative spend so far (solid)
// against the expected pace for the whole month (dashed). Server-rendered
// SVG, no interaction — it's a glance, not an analysis tool; the desktop
// Spending page has the full hoverable version.
//
// Both lines clear 3:1 against the hero card (WCAG 1.4.11) and differ by
// dash as well as color, and the accessible label states the numbers the
// lines show rather than just naming the chart.
const W = 300;
const H = 64;
const PAD = 4;

export function PaceChart({
  actual,
  expected,
  label,
}: {
  // Cumulative spend per day through today (index 0 = day 1).
  actual: number[];
  // Cumulative expected spend per day for the whole month.
  expected: number[];
  // What the chart shows, in words.
  label: string;
}) {
  const total = expected.length;
  if (total < 2 || actual.length === 0) return null;

  const max = Math.max(...expected, ...actual, 1);
  const x = (i: number) => (i / (total - 1)) * W;
  const y = (v: number) => PAD + (H - PAD * 2) * (1 - v / max);
  const path = (series: number[]) =>
    series.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");

  const last = actual.length - 1;
  const dot = { left: `${(x(last) / W) * 100}%`, top: `${(y(actual[last]) / H) * 100}%` };

  return (
    <figure>
      <div className="relative h-16">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 size-full overflow-visible"
          role="img"
          aria-label={label}
        >
          <path
            d={path(expected)}
            fill="none"
            stroke="var(--text-secondary)"
            strokeWidth={1.5}
            strokeDasharray="3 4"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={path(actual)}
            fill="none"
            stroke="var(--text-primary)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {/* HTML, not an SVG circle — the stretched viewBox would squash a
            circle into an ellipse. */}
        <span
          aria-hidden="true"
          className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-(--bg-card-subtle) bg-(--text-primary)"
          style={dot}
        />
      </div>
      <figcaption className="ui-caption mt-(--space-2) flex items-center gap-(--space-4)" aria-hidden="true">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded-full bg-(--text-primary)" />
          Spent so far
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 border-t-[1.5px] border-dashed border-(--text-secondary)" />
          Expected pace
        </span>
      </figcaption>
    </figure>
  );
}
