import Link from "next/link";
import {
  getMonthlyTotals,
  getTopCategoryByMonth,
  getNetWorthHistory,
  getDebtBalanceHistory,
  getRecurringVsOtherByMonth,
  getPlannedTotalsByPeriod,
  getObjectives,
} from "@/lib/queries";
import { getPeriods } from "@/lib/periods";
import { formatMoney } from "@/lib/format";
import type { ChartPoint } from "@/app/(app)/monthly-trend-chart";
import { TrendExplorer } from "./trend-explorer";
import { EmptyState } from "@/app/(app)/empty-state";
import { YearSwitcher } from "./year-switcher";
import { ExportCsvButton } from "./export-csv-button";

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function monthLabel(month: string) {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
}

export default async function TrendsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const { year: requestedYear } = await searchParams;
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const year = Number(requestedYear) || currentYear;
  const isCurrentYear = year === currentYear;

  const start = iso(new Date(Date.UTC(year, 0, 1)));
  const end = isCurrentYear ? iso(now) : iso(new Date(Date.UTC(year, 11, 31)));
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);
  const currentMonthKey = isCurrentYear ? iso(now).slice(0, 7) : undefined;

  const prevStart = iso(new Date(Date.UTC(year - 1, 0, 1)));
  const prevEnd = iso(new Date(Date.UTC(year - 1, 11, 31)));

  const [
    monthly,
    prevYearMonthly,
    topCategoryByMonth,
    netWorthHistory,
    debtHistory,
    recurringVsOtherByMonth,
    objectives,
    periods,
  ] = await Promise.all([
    getMonthlyTotals(start, end),
    getMonthlyTotals(prevStart, prevEnd),
    getTopCategoryByMonth(start, end),
    getNetWorthHistory(),
    getDebtBalanceHistory(),
    getRecurringVsOtherByMonth(start, end),
    getObjectives(),
    getPeriods(),
  ]);

  // Two more years back, for the "compare last 3 years" small multiples.
  const [yearMinus1, yearMinus2] = await Promise.all([
    year - 1 <= currentYear
      ? getMonthlyTotals(iso(new Date(Date.UTC(year - 1, 0, 1))), iso(new Date(Date.UTC(year - 1, 11, 31))))
      : Promise.resolve([]),
    getMonthlyTotals(iso(new Date(Date.UTC(year - 2, 0, 1))), iso(new Date(Date.UTC(year - 2, 11, 31)))),
  ]);
  const multiYear = [
    { year: year - 2, data: yearMinus2 },
    { year: year - 1, data: yearMinus1 },
    { year, data: monthly },
  ];

  const prevByMonthOfYear = new Map(prevYearMonthly.map((m) => [m.month.slice(5, 7), m]));
  const prevYearAligned = monthly.map((m) => prevByMonthOfYear.get(m.month.slice(5, 7)) ?? null);

  const periodIdByMonth = new Map(periods.map((p) => [p.start_date.slice(0, 7), p.id]));
  const periodIdsInRange = monthly.map((m) => periodIdByMonth.get(m.month)).filter((id): id is string => !!id);
  const plannedByPeriod = await getPlannedTotalsByPeriod(periodIdsInRange);

  const objectiveMarkers = new Map<string, string[]>();
  for (const o of objectives) {
    if (!o.end_date) continue;
    const month = o.end_date.slice(0, 7);
    if (month < start.slice(0, 7) || month > end.slice(0, 7)) continue;
    objectiveMarkers.set(month, [...(objectiveMarkers.get(month) ?? []), o.name]);
  }

  // Trailing 3-month average expense, so a month 40%+ above its recent
  // normal gets flagged instead of blending into the rest of the bars.
  const expenses = monthly.map((m) => m.expense);
  const anomalyMonths = new Set<string>();
  monthly.forEach((m, i) => {
    if (i < 3) return;
    const avg = (expenses[i - 1] + expenses[i - 2] + expenses[i - 3]) / 3;
    if (avg > 0 && m.expense > avg * 1.4) anomalyMonths.add(m.month);
  });

  const chartData: ChartPoint[] = monthly.map((m) => {
    const periodId = periodIdByMonth.get(m.month);
    return {
      ...m,
      label: monthLabel(m.month),
      isCurrent: m.month === currentMonthKey,
      expenseSplit: recurringVsOtherByMonth.get(m.month) ?? { recurring: 0, other: m.expense },
      planned: periodId ? plannedByPeriod.get(periodId) ?? null : null,
      objectiveNames: objectiveMarkers.get(m.month),
      isAnomaly: anomalyMonths.has(m.month),
    };
  });

  const netWorthPoints = netWorthHistory
    .filter((p) => p.endDate >= start && p.endDate <= end)
    .map((p) => ({ label: monthLabel(p.endDate.slice(0, 7)), value: p.netWorth }));
  const debtPoints = debtHistory
    .filter((p) => p.endDate >= start && p.endDate <= end)
    .map((p) => ({ label: monthLabel(p.endDate.slice(0, 7)), value: p.netWorth }));
  const savingsRatePoints = monthly.map((m) => ({
    label: monthLabel(m.month),
    value: m.income > 0 ? ((m.income - m.expense) / m.income) * 100 : 0,
  }));

  const ytdIncome = monthly.reduce((sum, m) => sum + m.income, 0);
  const ytdExpense = monthly.reduce((sum, m) => sum + m.expense, 0);
  const ytdNet = ytdIncome - ytdExpense;
  const savingsRate = ytdIncome > 0 ? (ytdNet / ytdIncome) * 100 : null;
  const monthsWithActivity = monthly.filter((m) => m.income > 0 || m.expense > 0).length;
  const avgMonthlyNet = monthsWithActivity > 0 ? ytdNet / monthsWithActivity : 0;

  const monthsWithNet = monthly.map((m) => ({ month: m.month, net: m.income - m.expense }));
  const bestMonth = monthsWithNet.length ? monthsWithNet.reduce((a, b) => (b.net > a.net ? b : a)) : null;
  const worstMonth = monthsWithNet.length ? monthsWithNet.reduce((a, b) => (b.net < a.net ? b : a)) : null;

  const hasActivity = !monthly.every((m) => m.income === 0 && m.expense === 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-text">
            {year}
            {isCurrentYear ? " Year to Date" : ""}
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Monthly income vs. expenses, {start} – {end}.
          </p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <ExportCsvButton year={year} data={monthly} />
          <YearSwitcher year={year} years={years} />
        </div>
      </div>

      {hasActivity ? (
        <TrendExplorer
          monthly={chartData}
          prevYearAligned={prevYearAligned}
          savingsRatePoints={savingsRatePoints}
          netWorthPoints={netWorthPoints}
          debtPoints={debtPoints}
          multiYear={multiYear}
          year={year}
        />
      ) : (
        <div className="rounded-xl border border-border bg-surface p-6 shadow-card">
          <EmptyState message={`No transactions logged in ${year}.`} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="YTD Income" value={ytdIncome} />
        <StatCard label="YTD Expenses" value={ytdExpense} />
        <StatCard label="YTD Net" value={ytdNet} colorBySign />
        <StatCard
          label="Avg monthly net"
          value={avgMonthlyNet}
          colorBySign
          suffix={savingsRate !== null ? `${savingsRate.toFixed(0)}% savings rate` : undefined}
        />
      </div>

      {hasActivity && bestMonth && worstMonth && bestMonth.month !== worstMonth.month && (
        <p className="text-sm text-text-muted">
          Best month:{" "}
          <span className="font-medium text-success">
            {monthLabel(bestMonth.month)} ({formatMoney(bestMonth.net)})
          </span>
          {" · "}Toughest month:{" "}
          <span className="font-medium text-[#f04438]">
            {monthLabel(worstMonth.month)} ({formatMoney(worstMonth.net)})
          </span>
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-card">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border bg-bg">
              <th className="px-6 py-2 text-xs font-medium text-text-muted">Month</th>
              <th className="px-6 py-2 text-right text-xs font-medium text-text-muted">Income</th>
              <th className="px-6 py-2 text-right text-xs font-medium text-text-muted">Expenses</th>
              <th className="px-6 py-2 text-right text-xs font-medium text-text-muted">Net</th>
              <th className="px-6 py-2 text-xs font-medium text-text-muted">Top category</th>
            </tr>
          </thead>
          <tbody>
            {monthly.map((m) => {
              const net = m.income - m.expense;
              const top = topCategoryByMonth.get(m.month);
              return (
                <tr key={m.month} className="border-b border-border last:border-b-0 hover:bg-bg even:bg-bg/40">
                  <td className="px-6 py-2.5 text-sm font-medium text-text">
                    {new Date(`${m.month}-01T00:00:00Z`).toLocaleDateString("en-US", {
                      month: "long",
                      year: "numeric",
                      timeZone: "UTC",
                    })}
                  </td>
                  <td className="tabular px-6 py-2.5 text-right text-sm text-success">
                    {formatMoney(m.income)}
                  </td>
                  <td className="tabular px-6 py-2.5 text-right text-sm text-text">
                    {formatMoney(m.expense)}
                  </td>
                  <td
                    className={`tabular px-6 py-2.5 text-right text-sm font-medium ${
                      net > 0 ? "text-success" : net < 0 ? "text-[#f04438]" : "text-text-muted"
                    }`}
                  >
                    {formatMoney(net)}
                  </td>
                  <td className="px-6 py-2.5 text-sm text-text-muted">
                    {top ? `${top.categoryName} (${formatMoney(top.amount)})` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {periods.length > 0 && (
          <div className="border-t border-border px-6 py-3 print:hidden">
            <p className="text-xs text-text-faint">Click a month below to view its transactions.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {monthly.map((m) => {
                const periodId = periodIdByMonth.get(m.month);
                if (!periodId) return null;
                return (
                  <Link
                    key={m.month}
                    href={`/transactions?period=${periodId}`}
                    className="rounded-md border border-border px-2 py-1 text-xs font-medium text-text-muted hover:bg-bg hover:text-accent"
                  >
                    {monthLabel(m.month)} →
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  colorBySign,
  suffix,
}: {
  label: string;
  value: number;
  colorBySign?: boolean;
  suffix?: string;
}) {
  const valueColor = colorBySign
    ? value > 0
      ? "text-success"
      : value < 0
        ? "text-[#f04438]"
        : "text-text"
    : "text-text";
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-6 shadow-card">
      <p className="text-sm font-medium text-text-muted">{label}</p>
      <p className={`tabular text-[28px] leading-9 font-semibold tracking-[-0.56px] ${valueColor}`}>
        {formatMoney(value)}
      </p>
      {suffix && <p className="text-xs text-text-faint">{suffix}</p>}
    </div>
  );
}
