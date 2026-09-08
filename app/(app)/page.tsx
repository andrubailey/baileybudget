import Link from "next/link";
import { getPeriods, pickPeriod } from "@/lib/periods";
import { resolveRange, getPreviousRange } from "@/lib/ranges";
import { createClient } from "@/lib/supabase/server";
import {
  getAccountsWithBalances,
  getBalanceHistory,
  getCategoryProgressForRange,
  getNetWorthHistory,
  getObjectives,
  getPeriodSummaryForRange,
  getTransactionsForRange,
} from "@/lib/queries";
import { AnimatedMoney } from "@/app/(app)/animated-number";
import { GreetingHeader } from "@/app/(app)/greeting-header";
import { formatMoney, formatDate, firstNameFromEmail } from "@/lib/format";
import { BudgetCategoriesCard } from "@/app/(app)/budget-categories";
import { GoalBanner } from "@/app/(app)/goal-banner";
import { EmptyState } from "@/app/(app)/empty-state";
import { getCategoryColor } from "@/lib/category-colors";
import { getAvatarColors } from "@/lib/avatar-colors";

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
}

type Trend = { pct: number; good: boolean } | null;

// Compares the current value against the prior period. `invert` is for
// metrics like expenses where a decrease is the good direction.
function trend(
  current: number,
  previous: number,
  opts?: { invert?: boolean },
): Trend {
  if (previous === 0) return null;
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  const rose = pct > 0;
  const good = opts?.invert ? !rose : rose;
  return { pct, good };
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; start?: string; end?: string }>;
}) {
  const {
    range: requestedRange,
    start: customStart,
    end: customEnd,
  } = await searchParams;
  const range = resolveRange(requestedRange, customStart, customEnd);
  const previousRange = getPreviousRange(range.start, range.end);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const firstName = user?.email ? firstNameFromEmail(user.email) : "there";

  // Only used to find the prior period for the balance trend comparison.
  const periods = await getPeriods();
  const currentPeriod = pickPeriod(periods);
  const previousPeriod = currentPeriod
    ? periods[periods.findIndex((p) => p.id === currentPeriod.id) + 1]
    : undefined;

  const [
    accounts,
    summary,
    previousSummary,
    categoryProgress,
    transactions,
    netWorthHistory,
    balanceHistory,
    objectives,
  ] = await Promise.all([
    getAccountsWithBalances(),
    getPeriodSummaryForRange(range.start, range.end),
    getPeriodSummaryForRange(previousRange.start, previousRange.end),
    getCategoryProgressForRange(range.start, range.end),
    getTransactionsForRange(range.start, range.end),
    getNetWorthHistory(),
    getBalanceHistory(90),
    getObjectives(),
  ]);

  const activeAccounts = accounts.filter((a) => a.is_active);

  // Every category keeps one stable color (hashed from its id) so the
  // recent-transactions dot always matches whatever's shown elsewhere.
  const categoryColorById = new Map<string, string>(
    categoryProgress.map((c) => [c.id, getCategoryColor(c.id)]),
  );

  const recentTransactions = transactions.slice(0, 7);

  // Planned amounts live on a single period (budget_lines), so they're only
  // directly editable here when the visible range is exactly one existing
  // period — a multi-month range's "planned" is a sum with no one row to edit.
  const editablePeriod =
    periods.find(
      (p) => p.start_date === range.start && p.end_date === range.end,
    ) ?? null;

  // Total balance = the real cash across every active account right now, not
  // budget remaining — compared against last month's end-of-period net worth
  // snapshot (transfers cancel out there, so it's the same total-across-
  // accounts figure) to show whether that total is trending up or down.
  const totalBalance = activeAccounts.reduce((sum, a) => sum + a.balance, 0);
  const previousTotalBalance = previousPeriod
    ? (netWorthHistory.find((p) => p.periodId === previousPeriod.id)
        ?.netWorth ?? null)
    : null;
  const balanceTrend =
    previousTotalBalance !== null
      ? trend(totalBalance, previousTotalBalance)
      : null;
  const incomeTrend = trend(summary.income, previousSummary.income);
  const expenseTrend = trend(summary.expense, previousSummary.expense, {
    invert: true,
  });

  const balanceSparklinePoints = balanceHistory.map((p) => p.balance);

  // Savings rate = the share of income kept rather than spent, for this
  // range vs. the same-length prior range.
  const savingsRate =
    summary.income > 0
      ? ((summary.income - summary.expense) / summary.income) * 100
      : 0;
  const previousSavingsRate =
    previousSummary.income > 0
      ? ((previousSummary.income - previousSummary.expense) /
          previousSummary.income) *
        100
      : 0;
  const savingsRateTrend = trend(savingsRate, previousSavingsRate);

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <GreetingHeader firstName={firstName} />
        <div className="flex shrink-0 items-center gap-3">
          <Link
            href="/transactions"
            aria-label="Transactions needing approval"
            className="relative flex size-11 shrink-0 items-center justify-center rounded-full border border-border text-text-muted hover:bg-bg hover:text-text"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M6 8a6 6 0 1 1 12 0c0 3.5 1 5 2 6H4c1-1 2-2.5 2-6Z"
                stroke="currentColor"
                strokeWidth={1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M10 20a2 2 0 0 0 4 0"
                stroke="currentColor"
                strokeWidth={1.6}
                strokeLinecap="round"
              />
            </svg>
          </Link>
          <Link
            href="/accounts"
            className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent/90"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 5v14M5 12h14"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
              />
            </svg>
            Add Account
          </Link>
        </div>
      </div>

      {/* Five-column grid so Total Balance can span 2 columns — the largest,
          most important card — while the other three take 1 each. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="Total Balance"
          className="xl:col-span-2"
          value={
            <AnimatedMoney
              value={totalBalance}
              className={`tabular text-[26px] leading-[32px] font-bold tracking-[-0.02em] ${
                totalBalance >= 0 ? "text-text" : "text-danger"
              }`}
            />
          }
          trendValue={balanceTrend}
          graph={
            balanceSparklinePoints.length > 1 && (
              <Sparkline
                points={balanceSparklinePoints}
                color={
                  balanceSparklinePoints[balanceSparklinePoints.length - 1] >=
                  balanceSparklinePoints[0]
                    ? "var(--success)"
                    : "var(--danger)"
                }
              />
            )
          }
        />

        <MetricCard
          label="Monthly Income"
          iconBg="#dcfae6"
          iconColor="#0b9055"
          icon={
            <path
              d="M3 17 9 11l4 4 8-8M21 7h-6m6 0v6"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          }
          value={
            <AnimatedMoney
              value={summary.income}
              className="tabular text-[26px] leading-[32px] font-bold tracking-[-0.02em] text-text"
            />
          }
          trendValue={incomeTrend}
        />

        <MetricCard
          label="Monthly Expenses"
          iconBg="#fee4e2"
          iconColor="#b42318"
          icon={
            <path
              d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0v12a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V7m-6 4v5m4-5v5"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          }
          value={
            <AnimatedMoney
              value={summary.expense}
              className="tabular text-[26px] leading-[32px] font-bold tracking-[-0.02em] text-text"
            />
          }
          trendValue={expenseTrend}
        />

        <MetricCard
          label="Savings Rate"
          iconBg="#f4ebff"
          iconColor="#6941c6"
          icon={
            <path
              d="M12 2 3 7v6c0 5 4 8.5 9 9 5-.5 9-4 9-9V7l-9-5Zm-3.5 9.5 2 2 4.5-4.5"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          }
          value={
            <p className="tabular text-[26px] leading-[32px] font-bold tracking-[-0.02em] text-text">
              {Math.round(savingsRate)}%
            </p>
          }
          trendValue={savingsRateTrend}
        />
      </div>

      {/* Budget categories + recent transactions, side by side — the budget
          table gets the wider column since it has several columns of its
          own, recent transactions stays a narrower glanceable list. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-stretch">
        <BudgetCategoriesCard
          categoryProgress={categoryProgress}
          editablePeriodId={editablePeriod?.id ?? null}
          rangeIsSinglePeriod={Boolean(editablePeriod)}
          limit={7}
        />

        <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-surface p-5 shadow-card sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-heading text-text">Recent Transactions</p>
            <Link
              href="/transactions"
              className="text-xs font-medium text-text-faint hover:text-text"
            >
              View All
            </Link>
          </div>

          <div className="divide-y divide-border">
            {recentTransactions.map((t) => {
              const avatar = getAvatarColors(t.id);
              return (
                <div
                  key={t.id}
                  className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <span
                    className="relative flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                    style={{ backgroundColor: avatar.bg, color: avatar.text }}
                  >
                    {initials(t.description)}
                    {t.category_id && categoryColorById.has(t.category_id) && (
                      <span
                        className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full border border-surface"
                        style={{
                          backgroundColor: categoryColorById.get(t.category_id),
                        }}
                      />
                    )}
                    <span
                      className={`absolute -top-0.5 -left-0.5 flex size-3.5 items-center justify-center rounded-full border border-surface ${
                        t.kind === "income"
                          ? "bg-success"
                          : t.kind === "transfer"
                            ? "bg-[#0ba5ec]"
                            : "bg-text-faint"
                      }`}
                    >
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none">
                        <path
                          d={
                            t.kind === "income"
                              ? "M12 19V5m0 0-6 6m6-6 6 6"
                              : t.kind === "transfer"
                                ? "M4 8h13m0 0-4-4m4 4-4 4M20 16H7m0 0 4 4m-4-4 4-4"
                                : "M12 5v14m0 0-6-6m6 6 6-6"
                          }
                          stroke="white"
                          strokeWidth={2.5}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text">
                      {t.description}
                    </p>
                    <p className="truncate text-xs text-text-faint">
                      {formatDate(t.txn_date)}
                    </p>
                  </div>
                  <span
                    className={`tabular shrink-0 text-sm font-medium ${
                      t.kind === "income" ? "text-success" : "text-text"
                    }`}
                  >
                    {t.kind === "income"
                      ? "+"
                      : t.kind === "expense"
                        ? "-"
                        : ""}
                    {formatMoney(t.amount)}
                  </span>
                </div>
              );
            })}
            {recentTransactions.length === 0 && (
              <EmptyState message="No transactions logged for this range yet." />
            )}
          </div>
        </div>
      </div>

      <GoalBanner objectives={objectives} accounts={accounts} />
    </div>
  );
}

function MetricCard({
  label,
  icon,
  iconBg,
  iconColor,
  value,
  trendValue,
  graph,
  className,
}: {
  label: string;
  icon?: React.ReactNode;
  iconBg?: string;
  iconColor?: string;
  value: React.ReactNode;
  trendValue: Trend;
  graph?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`card-hover flex flex-col rounded-xl border border-border bg-surface p-5 shadow-card sm:p-6 ${className ?? ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium whitespace-nowrap text-text-muted">
          {label}
        </p>
        {icon && (
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: iconBg, color: iconColor }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              {icon}
            </svg>
          </span>
        )}
      </div>
      <div className="mt-5">{value}</div>
      {trendValue && (
        <p
          className={`mt-2 flex items-center gap-1 text-xs font-medium ${
            trendValue.good ? "text-success" : "text-danger"
          }`}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            className={`shrink-0 ${trendValue.pct >= 0 ? "" : "rotate-180"}`}
          >
            <path
              d="M12 19V5m0 0-6 6m6-6 6 6"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {Math.abs(trendValue.pct).toFixed(1)}% from last month
        </p>
      )}
      {graph && <div className="mt-3 flex-1">{graph}</div>}
    </div>
  );
}

// Minimal non-interactive line chart — 90 daily balance points normalized
// into a 0-1 range so the visual trend reads clearly regardless of the
// account's actual balance magnitude.
function Sparkline({ points, color }: { points: number[]; color: string }) {
  const width = 240;
  const height = 48;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const step = width / (points.length - 1);
  const coords = points
    .map(
      (p, i) =>
        `${i * step},${height - ((p - min) / range) * (height - 6) - 3}`,
    )
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="h-12 w-full"
    >
      <polyline
        points={coords}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
