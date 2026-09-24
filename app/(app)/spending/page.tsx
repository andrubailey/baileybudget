import Link from "next/link";
import { getPeriods, pickPeriod } from "@/lib/periods";
import {
  getAccounts,
  getCategories,
  getCategoryProgressForRange,
  getMonthlyFlow,
  getPeriodSummary,
  getPostedRecurringIds,
  getRecurringTransactions,
  getSplitsByTransaction,
  getTransactions,
  getTransactionsForRange,
} from "@/lib/queries";
import { formatMoney } from "@/lib/format";
import type { Period, Transaction } from "@/lib/types";
import { PageHeader } from "@/app/(app)/page-header";
import { EmptyState } from "@/app/(app)/empty-state";
import { RecentTransactionsList } from "@/app/(app)/recent-transactions-list";
import { AnimatedMoney } from "@/app/(app)/animated-number";
import { StatusPill } from "@/app/(app)/status-pill";
import { SpendingTabs } from "./spending-tabs";
import { SpendPaceChart } from "./spend-pace-chart";
import { UpcomingCalendar, buildUpcomingDays } from "./upcoming-calendar";
import { buildCategoryRows, isIncomeTransaction } from "./build-category-rows";
import { PeriodStrip } from "./breakdown/period-strip";
import { BreakdownPanel } from "./breakdown/breakdown-panel";
import { CashFlowCard } from "./breakdown/side-cards";

// On a debt account (credit card, loan) a charge is stored as "income" and a
// payment as "expense", so spending is "expense on a normal account, or
// income on a debt account" and a debt payment isn't spending at all — the
// same rule the dashboard's Monthly Expenses total uses.
function classify(t: Transaction, debtIds: Set<string>): "spend" | "income" | null {
  if (t.kind !== "income" && t.kind !== "expense") return null;
  const isDebt = t.account_id ? debtIds.has(t.account_id) : false;
  if (!isDebt) return t.kind === "expense" ? "spend" : "income";
  return t.kind === "income" ? "spend" : null;
}

function daysInPeriod(period: Period) {
  return Number(period.end_date.slice(8, 10));
}

// Running spend total per day. A transaction tagged to this period but dated
// outside it (a backdated late entry) counts on the nearest edge day, so the
// chart's final total matches the period's real total.
function cumulativeSpend(
  transactions: Transaction[],
  debtIds: Set<string>,
  period: Period,
  uptoDay: number,
) {
  const days = daysInPeriod(period);
  const perDay = new Array<number>(days).fill(0);
  for (const t of transactions) {
    if (classify(t, debtIds) !== "spend") continue;
    let day = Number(t.txn_date.slice(8, 10));
    if (t.txn_date < period.start_date) day = 1;
    else if (t.txn_date > period.end_date) day = days;
    perDay[Math.min(days, Math.max(1, day)) - 1] += t.amount;
  }
  const series: number[] = [];
  let running = 0;
  for (let i = 0; i < Math.min(uptoDay, days); i++) {
    running += perDay[i];
    series.push(running);
  }
  return series;
}

export default async function SpendingPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period: requestedPeriod } = await searchParams;
  const periods = await getPeriods();
  const period = pickPeriod(periods, requestedPeriod);

  if (!period) {
    return (
      <div className="space-y-6">
        <PageHeader title="Spending" />
        <SpendingTabs />
        <p className="text-sm text-text-muted">
          Couldn&apos;t set up this month&apos;s period automatically. Try reloading the page.
        </p>
      </div>
    );
  }

  // getPeriods() is newest first, so the one after the current is last month.
  const previous = periods[periods.findIndex((p) => p.id === period.id) + 1] ?? null;

  // Six months back, for the per-category history BreakdownPanel shows
  // (monthly average, last month).
  const historyStart = new Date(`${period.start_date}T00:00:00Z`);
  historyStart.setUTCMonth(historyStart.getUTCMonth() - 5);
  const historyStartIso = historyStart.toISOString().slice(0, 10);

  const [
    transactions,
    previousTransactions,
    categoryProgress,
    summary,
    recurring,
    postedIds,
    accounts,
    categories,
    historyTransactions,
    flow,
  ] = await Promise.all([
    getTransactions(period.id),
    previous ? getTransactions(previous.id) : Promise.resolve([] as Transaction[]),
    getCategoryProgressForRange(period.start_date, period.end_date),
    getPeriodSummary(period.id),
    getRecurringTransactions(),
    getPostedRecurringIds(period.id),
    getAccounts(),
    getCategories(),
    getTransactionsForRange(historyStartIso, period.end_date),
    getMonthlyFlow(24),
  ]);

  const debtIds = new Set(accounts.filter((a) => a.is_debt).map((a) => a.id));
  const today = new Date().toISOString().slice(0, 10);
  const isCurrent = period.start_date <= today && period.end_date >= today;
  const days = daysInPeriod(period);
  const todayDay = isCurrent ? Number(today.slice(8, 10)) : days;

  const current = cumulativeSpend(transactions, debtIds, period, todayDay);
  const previousSeries = previous
    ? cumulativeSpend(previousTransactions, debtIds, previous, daysInPeriod(previous))
    : [];
  const spentSoFar = current[current.length - 1] ?? 0;
  const previousSameDay = previousSeries[Math.min(todayDay, previousSeries.length) - 1] ?? null;
  const paceChange =
    previousSameDay && previousSameDay > 0 ? ((spentSoFar - previousSameDay) / previousSameDay) * 100 : null;
  const totalBudget = categoryProgress.reduce((sum, c) => sum + Math.max(0, c.planned), 0);
  const previousMonthName = previous ? previous.name.split(" ")[0] : null;

  // Reframes the hero card around "what's left, and what that means per day"
  // instead of a bare running total — the number that actually answers "can
  // I still buy this," the way the reference design's own hero card does.
  // Falls back to the old spent-vs-last-month framing when there's no
  // budget set at all, since "left" has no meaning without a plan.
  const daysLeftInMonth = Math.max(0, days - todayDay);
  const remaining = totalBudget > 0 ? totalBudget - spentSoFar : null;
  const budgetedDailyRate = totalBudget > 0 ? totalBudget / days : null;
  const actualDailyRate = todayDay > 0 ? spentSoFar / todayDay : 0;
  const paceDiffPerDay = budgetedDailyRate !== null ? budgetedDailyRate - actualDailyRate : null;
  // Bills that'll still post this period get carved out of the daily
  // allowance up front — otherwise "left" looks more spendable than it
  // actually is once rent or a subscription still has to come out of it.
  const upcomingBillsTotal = recurring
    .filter((r) => r.kind === "expense" && r.is_active && !postedIds.has(r.id))
    .reduce((sum, r) => sum + r.amount, 0);
  const dailyAfterBills =
    remaining !== null && daysLeftInMonth > 0
      ? Math.max(0, remaining - upcomingBillsTotal) / daysLeftInMonth
      : null;

  const upcomingDays = buildUpcomingDays(recurring, postedIds, period.end_date, today);
  const recentTransactions = transactions.slice(0, 20);
  // So the detail panel can tell a split transaction apart from a plain
  // uncategorized one — see TransactionDetailModal's `splits` prop.
  const splitsByTransaction = await getSplitsByTransaction(
    recentTransactions.filter((t) => t.category_id === null).map((t) => t.id),
  );

  const rows = buildCategoryRows({
    period,
    categoryProgress,
    previousTransactions,
    historyTransactions,
    debtIds,
  });

  const incomeByCategory = new Map<string, number>();
  let uncategorizedIncome = 0;
  for (const t of transactions) {
    if (!isIncomeTransaction(t, debtIds)) continue;
    if (t.category_id) incomeByCategory.set(t.category_id, (incomeByCategory.get(t.category_id) ?? 0) + t.amount);
    else uncategorizedIncome += t.amount;
  }
  const incomeRows = categories
    .filter((c) => c.kind === "income")
    .map((c) => ({ id: c.id, name: c.name, icon: c.icon, actual: incomeByCategory.get(c.id) ?? 0 }))
    .filter((c) => c.actual > 0)
    .sort((a, b) => b.actual - a.actual);
  if (uncategorizedIncome > 0) {
    incomeRows.push({ id: "uncategorized", name: "Uncategorized", icon: "income", actual: uncategorizedIncome });
  }

  const strip = flow.map((f) => ({ periodId: f.periodId, label: f.label, expense: f.expense, income: f.income }));
  const stripWithNames = strip.map((s) => {
    const p = periods.find((x) => x.id === s.periodId);
    return { ...s, name: p?.name ?? s.label, startDate: p?.start_date ?? "" };
  });
  // The month selector only offers the past 12 months, ending with this
  // month — never months that haven't started yet.
  const lastTwelveMonths = stripWithNames.filter((m) => m.startDate !== "" && m.startDate <= today).slice(-12);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Spending"
        description={`Where your money went in ${period.name}, what's coming up, and how it compares to your budget.`}
      />
      <SpendingTabs />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <PeriodStrip months={lastTwelveMonths} selectedId={period.id} />

        <div className="flex h-full flex-col rounded-xl border border-border bg-bg p-5 shadow-card sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="text-section-label">{remaining !== null ? "Left this month" : "Spent this month"}</p>
            {paceDiffPerDay !== null && Math.round(paceDiffPerDay) !== 0 && (
              <StatusPill variant={paceDiffPerDay > 0 ? "good" : "danger"}>
                {paceDiffPerDay > 0 && (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M5 13l4 4L19 7"
                      stroke="currentColor"
                      strokeWidth={3}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
                {formatMoney(Math.abs(paceDiffPerDay))}/day {paceDiffPerDay > 0 ? "under" : "over"} pace
              </StatusPill>
            )}
          </div>
          <p className="tabular text-balance-display mt-2 text-text">
            <AnimatedMoney value={remaining ?? spentSoFar} />
          </p>
          {dailyAfterBills !== null ? (
            <p className="mt-1 text-sm text-text-muted">
              {formatMoney(dailyAfterBills)} a day for {daysLeftInMonth} more day
              {daysLeftInMonth === 1 ? "" : "s"}
              {upcomingBillsTotal > 0 ? ", after bills." : "."}
            </p>
          ) : (
            paceChange !== null &&
            previousMonthName && (
              <p className="mt-1 text-sm text-text-muted">
                <span className={paceChange > 0 ? "text-negative" : "text-positive"}>
                  {Math.abs(paceChange).toFixed(0)}% {paceChange > 0 ? "more" : "less"}
                </span>{" "}
                than {previousMonthName} by this point
              </p>
            )
          )}
          <div className="mt-3 flex items-center gap-4 text-xs text-text-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full bg-accent" aria-hidden="true" />
              {period.name.split(" ")[0]}
            </span>
            {previousMonthName && (
              <span className="flex items-center gap-1.5">
                <span
                  className="w-4 border-t-2 border-dashed border-text-faint"
                  aria-hidden="true"
                />
                {previousMonthName}
              </span>
            )}
          </div>
          <div className="mt-4 min-h-0 flex-1">
            <SpendPaceChart
              current={current}
              previous={previousSeries}
              daysInMonth={days}
              budget={totalBudget > 0 ? totalBudget : null}
              previousLabel={previousMonthName}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
        <div className="min-w-0 space-y-6">
          <BreakdownPanel
            periodId={period.id}
            periodName={period.name}
            rows={rows}
            incomeRows={incomeRows}
            totalIncome={summary.income}
            accounts={accounts}
            categories={categories}
          />
        </div>

        <div className="space-y-6">
          <CashFlowCard income={summary.income} expenses={summary.expense} />
          {/* Newest first; click a row to open it, right-click for the same
              menu as every other transaction list. */}
          <div className="card">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-section-label">Recent transactions</p>
              <Link
                href={`/transactions?period=${period.id}`}
                className="text-xs font-medium text-text-faint transition-colors hover:text-text"
              >
                View All
              </Link>
            </div>
            {transactions.length === 0 ? (
              <EmptyState compact message="Nothing logged this month yet." />
            ) : (
              <RecentTransactionsList
                transactions={recentTransactions}
                accounts={accounts}
                categories={categories}
                maxRows={6}
                splitsByTransaction={splitsByTransaction}
              />
            )}
          </div>

          <UpcomingCalendar days={upcomingDays} accounts={accounts} categories={categories} />
        </div>
      </div>
    </div>
  );
}
