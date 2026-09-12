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
import { SpendingTabs } from "./spending-tabs";
import { SpendPaceChart } from "./spend-pace-chart";
import { UpcomingCalendar, buildUpcomingDays } from "./upcoming-calendar";
import { buildCategoryRows, isIncomeTransaction, isSpendTransaction } from "./build-category-rows";
import { PeriodStrip } from "./breakdown/period-strip";
import { BreakdownPanel } from "./breakdown/breakdown-panel";
import { CashFlowCard, LargestTransactionsCard, MostFrequentCard } from "./breakdown/side-cards";

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

  const spendTransactions = transactions.filter((t) => isSpendTransaction(t, debtIds));
  const largest = [...spendTransactions].sort((a, b) => b.amount - a.amount).slice(0, 5);
  const frequency = new Map<string, { count: number; total: number }>();
  for (const t of spendTransactions) {
    const key = t.description.trim().toLowerCase();
    const entry = frequency.get(key) ?? { count: 0, total: 0 };
    entry.count += 1;
    entry.total += t.amount;
    frequency.set(key, entry);
  }
  const mostFrequent = [...frequency.entries()]
    .map(([key, v]) => ({
      name: spendTransactions.find((t) => t.description.trim().toLowerCase() === key)?.description ?? key,
      ...v,
    }))
    .sort((a, b) => b.count - a.count || b.total - a.total)
    .slice(0, 4);

  const strip = flow.map((f) => ({ periodId: f.periodId, label: f.label, expense: f.expense, income: f.income }));
  const stripWithNames = strip.map((s) => {
    const p = periods.find((x) => x.id === s.periodId);
    return { ...s, name: p?.name ?? s.label, startDate: p?.start_date ?? "" };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Spending"
        description={`Where your money went in ${period.name}, what's coming up, and how it compares to your budget.`}
      />
      <SpendingTabs />

      <PeriodStrip months={stripWithNames} selectedId={period.id} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
        <div className="min-w-0 space-y-6">
          <div className="card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-heading text-text">Spend this month</h2>
                <p className="tabular text-balance-display mt-1 text-text">{formatMoney(spentSoFar)}</p>
                {paceChange !== null && previousMonthName && (
                  <p className="mt-1 text-sm text-text-muted">
                    <span className={paceChange > 0 ? "text-negative" : "text-positive"}>
                      {Math.abs(paceChange).toFixed(0)}% {paceChange > 0 ? "more" : "less"}
                    </span>{" "}
                    than {previousMonthName} by this point
                  </p>
                )}
              </div>
              <div className="flex items-center gap-4 text-xs text-text-muted">
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
            </div>
            <div className="mt-4">
              <SpendPaceChart
                current={current}
                previous={previousSeries}
                daysInMonth={days}
                budget={totalBudget > 0 ? totalBudget : null}
                previousLabel={previousMonthName}
              />
            </div>
          </div>

          <BreakdownPanel
            periodId={period.id}
            periodName={period.name}
            rows={rows}
            incomeRows={incomeRows}
            totalIncome={summary.income}
            accounts={accounts}
            categories={categories}
          />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="card flex h-full flex-col">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-heading text-text">Recent Transactions</h2>
                <Link
                  href="/transactions"
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
                  maxRows={7}
                  splitsByTransaction={splitsByTransaction}
                />
              )}
            </div>

            <UpcomingCalendar days={upcomingDays} accounts={accounts} categories={categories} />
          </div>
        </div>

        <div className="space-y-6">
          <CashFlowCard income={summary.income} expenses={summary.expense} />
          <LargestTransactionsCard transactions={largest} />
          <MostFrequentCard items={mostFrequent} />
        </div>
      </div>
    </div>
  );
}
