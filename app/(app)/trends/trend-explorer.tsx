"use client";

import { useRef, useState } from "react";
import { formatMoney } from "@/lib/format";
import { MonthlyTrendChart, type ChartPoint } from "@/app/(app)/monthly-trend-chart";
import { SimpleLineChart } from "@/app/(app)/simple-line-chart";
import type { MonthlyTotal } from "@/lib/queries";

type Point = { label: string; value: number };
type YearData = { year: number; data: MonthlyTotal[] };

function aggregateToQuarters(data: ChartPoint[]): ChartPoint[] {
  const quarters: ChartPoint[] = [];
  for (let q = 0; q < 4; q++) {
    const slice = data.slice(q * 3, q * 3 + 3);
    if (slice.length === 0) continue;
    const income = slice.reduce((s, d) => s + d.income, 0);
    const expense = slice.reduce((s, d) => s + d.expense, 0);
    const planned = slice.reduce((s, d) => s + (d.planned ?? 0), 0);
    const recurring = slice.reduce((s, d) => s + (d.expenseSplit?.recurring ?? 0), 0);
    const other = slice.reduce((s, d) => s + (d.expenseSplit?.other ?? 0), 0);
    quarters.push({
      month: `Q${q + 1}`,
      label: `Q${q + 1}`,
      income,
      expense,
      planned,
      expenseSplit: { recurring, other },
      isCurrent: slice.some((d) => d.isCurrent),
      isAnomaly: slice.some((d) => d.isAnomaly),
      objectiveNames: slice.flatMap((d) => d.objectiveNames ?? []),
    });
  }
  return quarters;
}

function downloadChartPng(container: HTMLElement | null, filename: string) {
  const svg = container?.querySelector("svg");
  if (!svg) return;
  const serialized = new XMLSerializer().serializeToString(svg);
  const svgBlob = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  const img = new Image();
  img.onload = () => {
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = img.width * scale;
    canvas.height = img.height * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const pngUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = pngUrl;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(pngUrl);
    });
  };
  img.src = url;
}

export function TrendExplorer({
  monthly,
  prevYearAligned,
  savingsRatePoints,
  netWorthPoints,
  debtPoints,
  multiYear,
  year,
}: {
  monthly: ChartPoint[];
  prevYearAligned: (MonthlyTotal | null)[];
  savingsRatePoints: Point[];
  netWorthPoints: Point[];
  debtPoints: Point[];
  multiYear: YearData[];
  year: number;
}) {
  const [viewMode, setViewMode] = useState<"month" | "quarter">("month");
  const [showGhost, setShowGhost] = useState(true);
  const [showRollingAvg, setShowRollingAvg] = useState(true);
  const [showObjectives, setShowObjectives] = useState(true);
  const [showBudgetLine, setShowBudgetLine] = useState(true);
  const [showRecurringSplit, setShowRecurringSplit] = useState(true);
  const [showMultiYear, setShowMultiYear] = useState(false);
  const chartWrapRef = useRef<HTMLDivElement>(null);

  const displayData = viewMode === "quarter" ? aggregateToQuarters(monthly) : monthly;
  const rollingAvg =
    viewMode === "quarter"
      ? displayData.map((_, i) => {
          if (i < 1) return null;
          const nets = displayData.map((d) => d.income - d.expense);
          return (nets[i] + nets[i - 1]) / 2;
        })
      : monthly.map((d, i, arr) => {
          if (i < 2) return null;
          const nets = arr.map((m) => m.income - m.expense);
          return (nets[i] + nets[i - 1] + nets[i - 2]) / 3;
        });
  const anomalyMonths = monthly.filter((d) => d.isAnomaly).map((d) => d.label);

  const toggles: { key: string; label: string; on: boolean; set: (v: boolean) => void }[] = [
    { key: "ghost", label: "Last year", on: showGhost, set: setShowGhost },
    { key: "avg", label: "3-mo avg", on: showRollingAvg, set: setShowRollingAvg },
    { key: "goals", label: "Goal markers", on: showObjectives, set: setShowObjectives },
    { key: "budget", label: "Planned line", on: showBudgetLine, set: setShowBudgetLine },
    { key: "recurring", label: "Recurring split", on: showRecurringSplit, set: setShowRecurringSplit },
  ];

  return (
    <div className="rounded-xl border border-border bg-surface p-6 shadow-card">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-heading text-text">Income vs. expenses</h2>
          {anomalyMonths.length > 0 && (
            <p className="mt-1 text-xs font-medium text-[#f04438]">
              ⚠ Unusually high spending: {anomalyMonths.join(", ")}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <div className="flex rounded-lg border border-border bg-bg p-0.5">
            {(["month", "quarter"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold capitalize transition-colors ${
                  viewMode === mode ? "bg-surface text-accent shadow-card" : "text-text-muted"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => downloadChartPng(chartWrapRef.current, `trends-${year}-chart.png`)}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text-muted hover:bg-bg"
          >
            Save chart as PNG
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text-muted hover:bg-bg"
          >
            Print
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-x-4 gap-y-2 print:hidden">
        {toggles.map((t) => (
          <label key={t.key} className="flex items-center gap-1.5 text-xs text-text-muted">
            <input
              type="checkbox"
              checked={t.on}
              onChange={(e) => t.set(e.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--accent)]"
            />
            {t.label}
          </label>
        ))}
        <label className="flex items-center gap-1.5 text-xs text-text-muted">
          <input
            type="checkbox"
            checked={showMultiYear}
            onChange={(e) => setShowMultiYear(e.target.checked)}
            className="h-3.5 w-3.5 accent-[var(--accent)]"
          />
          Compare last 3 years
        </label>
      </div>

      <div ref={chartWrapRef}>
        <MonthlyTrendChart
          data={displayData}
          prevYearData={viewMode === "month" ? prevYearAligned : undefined}
          rollingAvg={rollingAvg}
          showGhost={showGhost && viewMode === "month"}
          showRollingAvg={showRollingAvg}
          showObjectives={showObjectives}
          showBudgetLine={showBudgetLine}
          showRecurringSplit={showRecurringSplit}
        />
      </div>

      {showMultiYear && (
        <div className="mt-6 grid grid-cols-1 gap-4 border-t border-border pt-6 sm:grid-cols-3">
          {multiYear.map((y) => (
            <div key={y.year}>
              <p className="mb-2 text-xs font-semibold text-text-muted">{y.year}</p>
              <MonthlyTrendChart
                data={y.data.map((d) => ({ ...d, label: d.month.slice(5, 7) }))}
                groupWidth={20}
                showGhost={false}
                showRollingAvg={false}
                showObjectives={false}
                showBudgetLine={false}
                showRecurringSplit={false}
                showAxisLabels={false}
                showLegend={false}
              />
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 border-t border-border pt-6 lg:grid-cols-3">
        <div>
          <h3 className="mb-3 text-sm font-semibold text-text">Savings rate</h3>
          <SimpleLineChart points={savingsRatePoints} color="#0d9488" formatValue={(v) => `${v.toFixed(0)}%`} />
        </div>
        <div>
          <h3 className="mb-3 text-sm font-semibold text-text">Net worth</h3>
          {netWorthPoints.length >= 2 ? (
            <SimpleLineChart points={netWorthPoints} color="#7c3aed" formatValue={formatMoney} />
          ) : (
            <p className="text-sm text-text-muted">Not enough history yet.</p>
          )}
        </div>
        <div>
          <h3 className="mb-3 text-sm font-semibold text-text">Debt balance</h3>
          {debtPoints.length >= 2 ? (
            <SimpleLineChart points={debtPoints} color="#f79009" formatValue={formatMoney} />
          ) : (
            <p className="text-sm text-text-muted">No debt accounts tracked.</p>
          )}
        </div>
      </div>
    </div>
  );
}
