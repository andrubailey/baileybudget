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
  getSavingsTransferTotal,
  getTransactionsForRange,
  type AccountWithBalance,
} from "@/lib/queries";
import { AnimatedMoney } from "@/app/(app)/animated-number";
import { GreetingHeader } from "@/app/(app)/greeting-header";
import { formatMoney, formatDate, firstNameFromEmail, progressColor } from "@/lib/format";
import { BudgetCategoriesCard } from "@/app/(app)/budget-categories";
import { GoalBanner } from "@/app/(app)/goal-banner";
import { NewTransactionButton } from "@/app/(app)/new-transaction-button";
import { BankLogo } from "@/app/(app)/accounts/bank-logo";
import { EmptyState } from "@/app/(app)/empty-state";
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
  // getSession() reads the JWT from cookies with no network call, unlike
  // getUser() — the layout above (and proxy.ts's middleware before that)
  // already did the real, network-validated auth check for this request, so
  // this is purely reading an already-verified session for the greeting.
  const [
    {
      data: { session },
    },
    periods,
  ] = await Promise.all([supabase.auth.getSession(), getPeriods()]);
  const firstName = session?.user?.email
    ? firstNameFromEmail(session.user.email)
    : "there";

  // Only used to find the prior period for the balance trend comparison.
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
    savingsTransfers,
    previousSavingsTransfers,
  ] = await Promise.all([
    getAccountsWithBalances(),
    getPeriodSummaryForRange(range.start, range.end),
    getPeriodSummaryForRange(previousRange.start, previousRange.end),
    getCategoryProgressForRange(range.start, range.end),
    getTransactionsForRange(range.start, range.end),
    getNetWorthHistory(),
    getBalanceHistory(90),
    getObjectives(),
    getSavingsTransferTotal(range.start, range.end),
    getSavingsTransferTotal(previousRange.start, previousRange.end),
  ]);

  const activeAccounts = accounts.filter((a) => a.is_active);

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

  // Savings rate = the share of income actually kept, for this range vs. the
  // same-length prior range. "Kept" includes money moved into (or pulled
  // out of) a savings-type account — income-minus-expense alone is blind to
  // that: pulling $5,000 from savings doesn't show up as an expense (it's a
  // transfer between your own accounts), so a household could deplete its
  // savings entirely in a month and still see a healthy-looking rate. Net
  // savings-transfer activity is added in so a withdrawal actually drags
  // this down (and can push it negative, correctly, if you drew down more
  // than you earned).
  const netSaved = summary.income - summary.expense + savingsTransfers;
  const previousNetSaved =
    previousSummary.income - previousSummary.expense + previousSavingsTransfers;
  const savingsRate = summary.income > 0 ? (netSaved / summary.income) * 100 : 0;
  const previousSavingsRate =
    previousSummary.income > 0
      ? (previousNetSaved / previousSummary.income) * 100
      : 0;
  // Savings rate is already a percentage, so a "% change" trend (like the
  // dollar metrics use) would show a percent-of-a-percent — a rate moving
  // from 20% to 25% is a +5 point swing, not "+25%" (which is what the
  // generic `trend()` helper computed here before). Percentage-point
  // difference is what actually reads correctly for a rate.
  const savingsRateTrend =
    previousSummary.income > 0
      ? {
          pct: savingsRate - previousSavingsRate,
          good: savingsRate - previousSavingsRate > 0,
        }
      : null;

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
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
          <NewTransactionButton variant="inline" menuAlign="right" />
        </div>
      </div>

      {/* Main content + a minimal accounts-at-a-glance rail on the right.
          The rail only appears as a true side column at xl+ — below that
          there's no room for a third column next to the metric cards, so it
          drops to full width below everything else instead. */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_260px] xl:items-start">
        <div className="min-w-0 space-y-6">
          {/* Five-column grid so Total Balance can span 2 columns — the largest,
          most important card — while the other three take 1 each. Deferred
          to 2xl (not xl) since the finances chat column now eats real
          content width on every page — at xl the cards were cramped enough
          to visually collide once that column is docked. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-5">
        <MetricCard
          label="Total Balance"
          index={0}
          className="2xl:col-span-2"
          value={
            <AnimatedMoney
              value={totalBalance}
              className={`tabular text-[34px] leading-[40px] font-bold tracking-[-0.02em] ${
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
          index={1}
          iconBg="var(--positive-bg)"
          iconColor="var(--positive-strong)"
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
              className="tabular text-[34px] leading-[40px] font-bold tracking-[-0.02em] text-text"
            />
          }
          trendValue={incomeTrend}
        />

        <MetricCard
          label="Monthly Expenses"
          index={2}
          iconBg="var(--negative-bg)"
          iconColor="var(--negative-strong)"
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
              className="tabular text-[34px] leading-[40px] font-bold tracking-[-0.02em] text-text"
            />
          }
          trendValue={expenseTrend}
        />

        <MetricCard
          label="Savings Rate"
          index={3}
          iconBg="var(--projected-bg)"
          iconColor="var(--projected-strong)"
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
            <p className="tabular text-[34px] leading-[40px] font-bold tracking-[-0.02em] text-text">
              {Math.round(savingsRate)}%
            </p>
          }
          trendValue={savingsRateTrend}
        />
      </div>

      {/* Budget categories + recent transactions, side by side — at 2xl this
          lines up with the metric row above it on the same 5-column grid:
          Budget Categories spans 3 (under Total Balance + Monthly Income),
          Recent Transactions spans 2 (under Monthly Expenses + Savings
          Rate). Below 2xl there's no metric row to align to, so it's just
          an even lg:grid-cols-2 split. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-stretch 2xl:grid-cols-5">
        {/* `grid` (not `flex`) so this wrapper's single child actually
            stretches to fill it — a flex row container sizes children by
            content on the main axis, which left the card its normal
            (unstretched) width even though the wrapper itself was correctly
            3 columns wide. Grid stretches children to fill both axes by
            default. */}
        <div className="grid 2xl:col-span-3">
          <BudgetCategoriesCard
            categoryProgress={categoryProgress}
            editablePeriodId={editablePeriod?.id ?? null}
            rangeIsSinglePeriod={Boolean(editablePeriod)}
          />
        </div>

        <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-surface p-5 shadow-card sm:p-6 2xl:col-span-2">
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
                    className="flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                    style={{ backgroundColor: avatar.bg, color: avatar.text }}
                  >
                    {initials(t.description)}
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
                    className={`tabular ml-4 shrink-0 text-sm font-medium ${
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

        <div className="xl:sticky xl:top-6">
          <AccountsGlanceCard accounts={activeAccounts} />
        </div>
      </div>
    </div>
  );
}

function AccountsGlanceCard({ accounts }: { accounts: AccountWithBalance[] }) {
  if (accounts.length === 0) return null;
  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-card sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-heading text-text">Accounts</p>
        <Link
          href="/accounts"
          className="text-xs font-medium text-text-faint hover:text-text"
        >
          View All
        </Link>
      </div>
      <div className="-my-1 divide-y divide-border">
        {accounts.map((a) => {
          const progress =
            !a.is_debt && a.goal && a.goal > 0
              ? Math.min(100, Math.max(0, (a.balance / a.goal) * 100))
              : null;
          // Debt payoff progress: how much of the gap between the starting
          // balance and the goal (usually 0) has been paid down so far —
          // same formula the Accounts page cards use.
          const payoffSpan = a.starting_balance - (a.goal ?? 0);
          const payoffProgress =
            a.is_debt && payoffSpan !== 0
              ? Math.min(100, Math.max(0, ((a.starting_balance - a.balance) / payoffSpan) * 100))
              : null;
          const barPct = progress ?? payoffProgress;

          return (
            <div key={a.id} className="py-3 first:pt-1 last:pb-1">
              <div className="flex items-center gap-2.5">
                {a.bank && <BankLogo bank={a.bank} size="sm" />}
                <span className="min-w-0 truncate text-sm text-text-muted">{a.name}</span>
              </div>
              <span className="tabular mt-1.5 block text-xl font-semibold text-text">
                {formatMoney(a.balance)}
                {a.is_debt && <span className="ml-1.5 text-sm font-normal text-text-faint">owed</span>}
              </span>
              {barPct !== null && (
                <div className="mt-1.5 flex items-center gap-2.5">
                  <div className="h-1 min-w-0 flex-1 rounded-full bg-bg">
                    <div
                      className="h-1 rounded-full"
                      style={{
                        width: `${barPct}%`,
                        backgroundColor: progress !== null ? progressColor(progress) : "var(--success)",
                      }}
                    />
                  </div>
                  <span className="tabular shrink-0 text-[11px] text-text-faint">
                    {barPct.toFixed(0)}%
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
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
  footnote,
  className,
  index = 0,
}: {
  label: string;
  icon?: React.ReactNode;
  iconBg?: string;
  iconColor?: string;
  value: React.ReactNode;
  trendValue: Trend;
  graph?: React.ReactNode;
  footnote?: React.ReactNode;
  className?: string;
  // Staggers this card's entrance behind the ones before it, so the row
  // reads left-to-right instead of every card fading in at once.
  index?: number;
}) {
  const trendNote = trendValue && (
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
  );

  // Icon cards (Income/Expenses/Savings Rate) use the reference layout: icon
  // pinned top-left, then the label/value/trend block anchored to the
  // bottom of the card. Total Balance has no icon and keeps its own
  // top-down layout instead, since its graph needs the middle space.
  if (icon) {
    return (
      <div
        style={{ animationDelay: `${index * 60}ms` }}
        className={`card-hover animate-fade-in-up flex h-full flex-col justify-between rounded-xl border border-border bg-surface p-5 shadow-card sm:p-6 ${className ?? ""}`}
      >
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: iconBg, color: iconColor }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            {icon}
          </svg>
        </span>
        <div className="mt-4">
          <p className="text-[13px] font-medium whitespace-nowrap text-text-muted">
            {label}
          </p>
          <div className="mt-1">{value}</div>
          {trendNote}
          {footnote}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{ animationDelay: `${index * 60}ms` }}
      className={`card-hover animate-fade-in-up flex h-full flex-col rounded-xl border border-border bg-surface p-5 shadow-card sm:p-6 ${className ?? ""}`}
    >
      <p className="text-[13px] font-medium whitespace-nowrap text-text-muted">
        {label}
      </p>
      <div className="mt-5">{value}</div>
      {trendNote}
      {graph && <div className="mt-4 max-w-[280px]">{graph}</div>}
    </div>
  );
}

// Minimal non-interactive line chart — 90 daily balance points normalized
// into a 0-1 range so the visual trend reads clearly regardless of the
// account's actual balance magnitude.
// Catmull-Rom -> cubic Bézier conversion, so the line curves smoothly through
// every point instead of the sharp zig-zag a plain polyline produces across
// 90 daily balance readings.
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return "";
  let d = `M ${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }
  return d;
}

function Sparkline({ points, color }: { points: number[]; color: string }) {
  const width = 240;
  const height = 64;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const step = width / (points.length - 1);
  const coords = points.map((p, i) => ({
    x: i * step,
    y: height - ((p - min) / range) * (height - 10) - 5,
  }));
  const linePath = smoothPath(coords);
  const last = coords[coords.length - 1];
  const first = coords[0];
  // Closes the line into a filled shape dropping straight down to the
  // baseline, for the soft gradient wash under the curve — a bare stroke
  // floating with nothing under it read as flat/thin against the rest of
  // the dashboard's more visually-weighted cards.
  const areaPath = `${linePath} L ${last.x},${height} L ${first.x},${height} Z`;
  // One gradient id per color variant (success/danger) is enough — no risk
  // of collision since those are the only two colors this ever renders.
  const gradientId = `sparkline-fill-${color.replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="h-16 w-full overflow-visible"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.28} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
      <path
        d={linePath}
        pathLength={1}
        className="animate-draw-line"
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last.x} cy={last.y} r={3} fill={color} />
    </svg>
  );
}
