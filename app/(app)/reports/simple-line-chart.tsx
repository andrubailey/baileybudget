// A compact single-series line chart for secondary metrics (savings rate,
// net worth) that don't share a dollar scale with the main bar chart, so
// cramming them onto one set of axes would distort both.
const HEIGHT = 100;
const STEP = 56;
const LEFT_PAD = 8;

export function SimpleLineChart({
  points,
  color,
  formatValue,
}: {
  points: { label: string; value: number }[];
  color: string;
  formatValue: (value: number) => string;
}) {
  if (points.length < 2) return null;

  const values = points.map((p) => p.value);
  const maxVal = Math.max(...values, 0);
  const minVal = Math.min(...values, 0);
  const domain = maxVal - minVal || 1;
  const width = LEFT_PAD * 2 + (points.length - 1) * STEP;

  const yFor = (value: number) => HEIGHT - ((value - minVal) / domain) * (HEIGHT - 8) - 4;
  const baselineY = yFor(0);

  const coords = points.map((p, i) => ({ x: LEFT_PAD + i * STEP, y: yFor(p.value) }));
  const linePath = coords
    .map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
    .join(" ");

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${HEIGHT + 20}`} width={width} height={HEIGHT + 20} className="min-w-full">
        {minVal < 0 && maxVal > 0 && (
          <line x1={0} y1={baselineY} x2={width} y2={baselineY} stroke="var(--border)" strokeWidth={1} />
        )}
        <path
          d={linePath}
          pathLength={1}
          className="animate-draw-line"
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {coords.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r={2.5} fill={color}>
            <title>{`${points[i].label}: ${formatValue(points[i].value)}`}</title>
          </circle>
        ))}
        {points.map((p, i) => (
          <text
            key={i}
            x={LEFT_PAD + i * STEP}
            y={HEIGHT + 14}
            textAnchor="middle"
            className="fill-text-faint"
            style={{ fontSize: 10 }}
          >
            {p.label}
          </text>
        ))}
      </svg>
    </div>
  );
}
