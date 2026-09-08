import { formatMoney } from "@/lib/format";
import type { MonthlyTotal } from "@/lib/queries";

const HEIGHT = 260;
const BAR_WIDTH = 20;
const LEFT_PAD = 8;
const TOP_PAD = 24;

export type ChartPoint = MonthlyTotal & {
  label: string;
  isCurrent?: boolean;
  expenseSplit?: { recurring: number; other: number } | null;
  planned?: number | null;
  objectiveNames?: string[];
  isAnomaly?: boolean;
};

// Bars (income/expense) and the net trend line all share one Y scale, so
// the line reads as "the gap between the two bars" rather than a
// disconnected overlay. `groupWidth` shrinks for the compact multi-year
// small-multiples view.
export function MonthlyTrendChart({
  data,
  prevYearData,
  rollingAvg,
  showGhost = true,
  showRollingAvg = true,
  showObjectives = true,
  showBudgetLine = true,
  showRecurringSplit = true,
  groupWidth = 64,
  showAxisLabels = true,
  showLegend = true,
}: {
  data: ChartPoint[];
  prevYearData?: (MonthlyTotal | null)[];
  rollingAvg?: (number | null)[];
  showGhost?: boolean;
  showRollingAvg?: boolean;
  showObjectives?: boolean;
  showBudgetLine?: boolean;
  showRecurringSplit?: boolean;
  groupWidth?: number;
  showAxisLabels?: boolean;
  showLegend?: boolean;
}) {
  if (data.length === 0) return null;

  const nets = data.map((d) => d.income - d.expense);
  const rollingVals = (rollingAvg ?? []).filter((v): v is number => v !== null);
  const prevVals = (prevYearData ?? []).filter((d): d is MonthlyTotal => d !== null);
  const plannedVals = data.map((d) => d.planned ?? 0);
  const maxVal = Math.max(
    ...data.flatMap((d) => [d.income, d.expense]),
    ...prevVals.flatMap((d) => [d.income, d.expense]),
    ...plannedVals,
    1,
  );
  const minVal = Math.min(0, ...nets, ...rollingVals);
  const domain = maxVal - minVal || 1;
  const width = LEFT_PAD * 2 + data.length * groupWidth;
  const barWidth = Math.min(BAR_WIDTH, groupWidth / 3.2);
  const chartHeight = groupWidth < 40 ? 100 : HEIGHT;
  const topPad = showObjectives ? TOP_PAD : 4;
  const bottomPad = showAxisLabels ? 28 : 4;

  const yFor = (value: number) => topPad + chartHeight - ((value - minVal) / domain) * chartHeight;
  const baselineY = yFor(0);

  const netPoints = data.map((d, i) => ({
    x: LEFT_PAD + i * groupWidth + groupWidth / 2,
    y: yFor(d.income - d.expense),
  }));
  const linePath = netPoints
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");

  const avgSegments: string[] = [];
  let currentSegment: string | null = null;
  (rollingAvg ?? []).forEach((v, i) => {
    const x = LEFT_PAD + i * groupWidth + groupWidth / 2;
    if (v === null || !showRollingAvg) {
      currentSegment = null;
      return;
    }
    const y = yFor(v);
    if (currentSegment === null) {
      currentSegment = `M${x.toFixed(1)},${y.toFixed(1)}`;
      avgSegments.push(currentSegment);
    } else {
      avgSegments[avgSegments.length - 1] += ` L${x.toFixed(1)},${y.toFixed(1)}`;
    }
  });

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${topPad + chartHeight + bottomPad}`}
        width={width}
        height={topPad + chartHeight + bottomPad}
        className="min-w-full"
      >
        <line x1={0} y1={baselineY} x2={width} y2={baselineY} stroke="var(--border)" strokeWidth={1} />

        {data.map((d, i) => {
          const groupX = LEFT_PAD + i * groupWidth + groupWidth / 2;
          const incomeY = yFor(d.income);
          const expenseY = yFor(d.expense);
          const prev = prevYearData?.[i];
          const split = showRecurringSplit ? d.expenseSplit : null;
          const recurringY = split ? yFor(split.recurring) : null;

          return (
            <g key={d.month + i}>
              {showGhost && prev && (
                <>
                  <rect
                    x={groupX - barWidth - 2}
                    y={Math.min(yFor(prev.income), baselineY)}
                    width={barWidth}
                    height={Math.abs(baselineY - yFor(prev.income))}
                    rx={3}
                    fill="none"
                    stroke="var(--accent)"
                    strokeOpacity={0.4}
                    strokeDasharray="2 2"
                  >
                    <title>{`${d.label} last year: ${formatMoney(prev.income)} income`}</title>
                  </rect>
                  <rect
                    x={groupX + 2}
                    y={Math.min(yFor(prev.expense), baselineY)}
                    width={barWidth}
                    height={Math.abs(baselineY - yFor(prev.expense))}
                    rx={3}
                    fill="none"
                    stroke="var(--negative)"
                    strokeOpacity={0.4}
                    strokeDasharray="2 2"
                  >
                    <title>{`${d.label} last year: ${formatMoney(prev.expense)} expenses`}</title>
                  </rect>
                </>
              )}

              <rect
                x={groupX - barWidth - 2}
                y={Math.min(incomeY, baselineY)}
                width={barWidth}
                height={Math.abs(baselineY - incomeY)}
                rx={3}
                fill="var(--accent)"
                fillOpacity={d.isCurrent ? 0.5 : 1}
                className="animate-bar-grow"
                style={{ animationDelay: `${i * 30}ms` }}
              >
                <title>{`${d.label}: ${formatMoney(d.income)} income${d.isCurrent ? " (in progress)" : ""}`}</title>
              </rect>

              {split && recurringY !== null ? (
                <>
                  <rect
                    x={groupX + 2}
                    y={Math.min(recurringY, baselineY)}
                    width={barWidth}
                    height={Math.abs(baselineY - recurringY)}
                    rx={3}
                    fill="var(--negative)"
                    fillOpacity={d.isCurrent ? 0.35 : 0.75}
                    className="animate-bar-grow-top"
                    style={{ animationDelay: `${i * 30}ms` }}
                  >
                    <title>{`${d.label}: ${formatMoney(split.recurring)} recurring bills`}</title>
                  </rect>
                  <rect
                    x={groupX + 2}
                    y={Math.min(expenseY, recurringY)}
                    width={barWidth}
                    height={Math.abs(recurringY - expenseY)}
                    fill="var(--negative)"
                    fillOpacity={d.isCurrent ? 0.2 : 0.4}
                    className="animate-bar-grow-top"
                    style={{ animationDelay: `${i * 30}ms` }}
                  >
                    <title>{`${d.label}: ${formatMoney(split.other)} other spending`}</title>
                  </rect>
                </>
              ) : (
                <rect
                  x={groupX + 2}
                  y={Math.min(expenseY, baselineY)}
                  width={barWidth}
                  height={Math.abs(baselineY - expenseY)}
                  rx={3}
                  fill="var(--negative)"
                  fillOpacity={d.isCurrent ? 0.4 : 0.75}
                  className="animate-bar-grow-top"
                  style={{ animationDelay: `${i * 30}ms` }}
                >
                  <title>{`${d.label}: ${formatMoney(d.expense)} expenses${d.isCurrent ? " (in progress)" : ""}`}</title>
                </rect>
              )}

              {showBudgetLine && d.planned != null && d.planned > 0 && (
                <line
                  x1={groupX + 1}
                  x2={groupX + 3 + barWidth}
                  y1={yFor(d.planned)}
                  y2={yFor(d.planned)}
                  stroke="var(--text)"
                  strokeWidth={2}
                  strokeDasharray="1 3"
                  strokeLinecap="round"
                >
                  <title>{`${d.label}: ${formatMoney(d.planned)} planned`}</title>
                </line>
              )}

              {d.isAnomaly && (
                <text x={groupX + 2 + barWidth / 2} y={Math.min(expenseY, baselineY) - 6} textAnchor="middle" style={{ fontSize: 12 }}>
                  <title>{`${d.label}: unusually high spending`}</title>
                  ⚠
                </text>
              )}

              {showObjectives && d.objectiveNames && d.objectiveNames.length > 0 && (
                <text x={groupX} y={topPad - 10} textAnchor="middle" style={{ fontSize: 13 }}>
                  <title>{`Goal due: ${d.objectiveNames.join(", ")}`}</title>
                  🎯
                </text>
              )}

              {showAxisLabels && (
                <text
                  x={groupX}
                  y={topPad + chartHeight + 20}
                  textAnchor="middle"
                  className="fill-text-faint"
                  style={{ fontSize: 11 }}
                >
                  {d.label}
                  {d.isCurrent ? "*" : ""}
                </text>
              )}
            </g>
          );
        })}

        <path
          d={linePath}
          pathLength={1}
          className="animate-draw-line"
          fill="none"
          stroke="var(--projected)"
          strokeWidth={2}
          strokeLinejoin="round"
        />
        {netPoints.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3} fill="var(--projected)">
            <title>{`${data[i].label}: ${formatMoney(nets[i])} net`}</title>
          </circle>
        ))}

        {avgSegments.map((d, i) => (
          <path
            key={i}
            d={d}
            fill="none"
            stroke="var(--text-faint)"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            strokeLinejoin="round"
          />
        ))}
      </svg>

      {showLegend && (
        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-text-muted">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-accent" /> Income
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-negative opacity-75" /> Expenses
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-projected" /> Net trend
          </span>
          {showRollingAvg && (
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-3 bg-text-faint" /> 3-mo avg net
            </span>
          )}
          {showGhost && prevYearData && (
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full border border-dashed border-accent" /> Last year
            </span>
          )}
          {showBudgetLine && (
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-3 bg-text" /> Planned
            </span>
          )}
          {data.some((d) => d.isCurrent) && <span className="text-text-faint">* in progress</span>}
        </div>
      )}
    </div>
  );
}
