import Link from "next/link";
import {
  getMonthlyTotals,
  getTopCategoryByMonth,
  getNetWorthHistory,
  getDebtBalanceHistory,
  getRecurringVsOtherByMonth,
  getPlannedTotalsByPeriod,
  getObjectives,
  getAccountsWithBalances,
  getCategories,
} from "@/lib/queries";
import { getPeriods } from "@/lib/periods";
import { Money } from "@/app/(app)/money";
import type { ChartPoint } from "./monthly-trend-chart";
import { TrendExplorer } from "./trend-explorer";
import { EmptyState } from "@/app/(app)/empty-state";
import { YearSwitcher } from "./year-switcher";
import { ExportCsvButton } from "./export-csv-button";
import { WeeklyRecapPanel } from "./weekly-recap-panel";
import { ImportDataButton } from "./import-data-button";
import { PageHeader } from "@/app/(app)/page-header";
import { CategoryChip } from "@/app/(app)/category-chip";

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function monthLabel(month: string) {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const { year: requestedYear } = await searchParams;
  const [accounts, categories] = await Promise.all([getAccountsWithBalances(), getCategories()]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Yearly trends and this week's recap, at a glance."
        actions={<ImportDataButton accounts={accounts} categories={categories} />}
      />

      {/* Trends is the primary content; the weekly recap sits alongside it
          instead of behind its own tab, so both are visible on one page
          without navigating away. Recap moves below Trends on narrow
          screens where there's no room for a side column. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:items-start">
        <div className="lg:col-span-2">
          <TrendsPanel requestedYear={requestedYear} />
        </div>
        <div className="lg:sticky lg:top-6">
          <h2 className="text-heading mb-3 text-text">Weekly recap</h2>
          <WeeklyRecapPanel compact />
        </div>
      </div>
    </div>
  );
}

async function TrendsPanel({ requestedYear }: { requestedYear?: string }) {
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

  // One combined fetch — the "compare last 3 years" data doesn't depend on
  // anything above it, so it was previously waiting on a whole separate
  // round-trip after the main batch for no reason.
  const [
    monthly,
    prevYearMonthly,
    topCategoryByMonth,
    netWorthHistory,
    debtHistory,
    recurringVsOtherByMonth,
    objectives,
    periods,
    yearMinus1,
    yearMinus2,
  ] = await Promise.all([
    getMonthlyTotals(start, end),
    getMonthlyTotals(prevStart, prevEnd),
    getTopCategoryByMonth(start, end),
    getNetWorthHistory(),
    getDebtBalanceHistory(),
    getRecurringVsOtherByMonth(start, end),
    getObjectives(),
    getPeriods(),
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
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-heading text-text">
            {year}
            {isCurrentYear ? " Year to Date" : ""}
          </h2>
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
        <div className="rounded-xl border border-border bg-surface p-5 shadow-card sm:p-6">
          <EmptyState message={`No transactions logged in ${year}.`} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="YTD Income" value={ytdIncome} index={0} />
        <StatCard label="YTD Expenses" value={ytdExpense} index={1} />
        <StatCard label="YTD Net" value={ytdNet} colorBySign index={2} />
        <StatCard
          label="Avg monthly net"
          value={avgMonthlyNet}
          colorBySign
          suffix={savingsRate !== null ? `${savingsRate.toFixed(0)}% savings rate` : undefined}
          index={3}
        />
      </div>

      {hasActivity && bestMonth && worstMonth && bestMonth.month !== worstMonth.month && (
        <p className="text-sm text-text-muted">
          Best month:{" "}
          <span className="font-medium text-positive">
            {monthLabel(bestMonth.month)} (<Money amount={bestMonth.net} signDisplay="auto" />)
          </span>
          {" · "}Toughest month:{" "}
          <span className="font-medium text-negative">
            {monthLabel(worstMonth.month)} (<Money amount={worstMonth.net} signDisplay="auto" />)
          </span>
        </p>
      )}

      {/* Mobile: one card per month, Net leads since it's the one number
          that actually answers "how did this month go" — Income/Expenses
          are secondary detail and Top category drops entirely rather than
          force a 5-column table into a 375px screen. Desktop keeps the full
          table below. */}
      <div className="space-y-2 sm:hidden">
        {monthly.map((m, i) => {
          const net = m.income - m.expense;
          const periodId = periodIdByMonth.get(m.month);
          const monthName = new Date(`${m.month}-01T00:00:00Z`).toLocaleDateString("en-US", {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          });
          const cardContent = (
            <>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-text">{monthName}</p>
                <Money
                  amount={net}
                  signDisplay="auto"
                  tone={net > 0 ? "positive" : net < 0 ? "negative" : "neutral"}
                  className="text-sm font-semibold"
                />
              </div>
              <div className="mt-1.5 flex items-center gap-3 text-xs text-text-faint">
                <span>
                  <Money amount={m.income} tone="positive" /> in
                </span>
                <span>
                  <Money amount={m.expense} /> out
                </span>
              </div>
            </>
          );
          return periodId ? (
            <Link
              key={m.month}
              href={`/transactions?period=${periodId}`}
              style={{ animationDelay: `${i * 35}ms` }}
              className="card-hover animate-fade-in-up block rounded-xl border border-border bg-surface p-4 shadow-card"
            >
              {cardContent}
            </Link>
          ) : (
            <div
              key={m.month}
              style={{ animationDelay: `${i * 35}ms` }}
              className="animate-fade-in-up rounded-xl border border-border bg-surface p-4 shadow-card"
            >
              {cardContent}
            </div>
          );
        })}
      </div>

      <div className="hidden overflow-x-auto rounded-xl border border-border bg-surface shadow-card sm:block">
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
            {monthly.map((m, i) => {
              const net = m.income - m.expense;
              const top = topCategoryByMonth.get(m.month);
              return (
                <tr
                  key={m.month}
                  style={{ animationDelay: `${i * 30}ms` }}
                  className="animate-fade-in-up border-b border-border transition-colors last:border-b-0 hover:bg-bg even:bg-bg/40"
                >
                  <td className="px-6 py-2.5 text-sm font-medium text-text">
                    {new Date(`${m.month}-01T00:00:00Z`).toLocaleDateString("en-US", {
                      month: "long",
                      year: "numeric",
                      timeZone: "UTC",
                    })}
                  </td>
                  <td className="px-6 py-2.5 text-right text-sm">
                    <Money amount={m.income} tone="positive" />
                  </td>
                  <td className="px-6 py-2.5 text-right text-sm text-text">
                    <Money amount={m.expense} />
                  </td>
                  <td className="px-6 py-2.5 text-right text-sm font-medium">
                    <Money
                      amount={net}
                      signDisplay="auto"
                      tone={net > 0 ? "positive" : net < 0 ? "negative" : "neutral"}
                    />
                  </td>
                  <td className="px-6 py-2.5 text-sm text-text-muted">
                    {top ? (
                      <span className="flex items-center gap-2">
                        <CategoryChip
                          id={top.categoryId}
                          name={top.categoryName}
                          icon={top.categoryIcon}
                          size="xs"
                        />
                        <Money amount={top.amount} className="text-text-faint" />
                      </span>
                    ) : (
                      "—"
                    )}
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
                    className="rounded-md border border-border px-2 py-1 text-xs font-medium text-text-muted transition-colors hover:bg-bg hover:text-accent"
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
  index = 0,
}: {
  label: string;
  value: number;
  colorBySign?: boolean;
  suffix?: string;
  index?: number;
}) {
  const tone = colorBySign
    ? value > 0
      ? "positive"
      : value < 0
        ? "negative"
        : "neutral"
    : "neutral";
  return (
    <div
      style={{ animationDelay: `${index * 60}ms` }}
      className="card-hover animate-fade-in-up flex flex-col gap-2 rounded-xl border border-border bg-surface p-5 shadow-card sm:p-6"
    >
      <p className="text-sm font-medium text-text-muted">{label}</p>
      <Money
        amount={value}
        variant="balance"
        signDisplay="auto"
        tone={tone}
        className="text-[34px] leading-[40px] font-bold tracking-[-0.005em]"
      />
      {suffix && <p className="text-xs text-text-faint">{suffix}</p>}
    </div>
  );
}
