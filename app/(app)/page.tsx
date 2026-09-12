import Link from "next/link";
import { getPeriods, pickPeriod } from "@/lib/periods";
import { resolveRange, getPreviousRange } from "@/lib/ranges";
import { getCurrentSession, getCurrentUserProfile } from "@/lib/profile";
import { getLoanSummaries } from "@/lib/loans";
import {
  getAccountsWithBalances,
  getBalanceHistory,
  getCategories,
  getCategoryProgressForRange,
  getObjectives,
  getPeriodSummaryForRange,
  getSavingsTransferTotal,
  getSplitsByTransaction,
  getTransactions,
  getTransactionsForRange,
} from "@/lib/queries";
import { AnimatedMoney } from "@/app/(app)/animated-number";
import { GreetingHeader } from "@/app/(app)/greeting-header";
import { formatMoney, firstNameFromEmail } from "@/lib/format";
import { BudgetCategoriesCard } from "@/app/(app)/budget-categories";
import { NewTransactionButton } from "@/app/(app)/new-transaction-button";
import { EmptyState } from "@/app/(app)/empty-state";
import { Sparkline } from "@/app/(app)/sparkline";
import { RecentTransactionsList } from "@/app/(app)/recent-transactions-list";
import { DashboardEqualHeightRow } from "@/app/(app)/dashboard-equal-height-row";
import { AccountsGlanceCard } from "@/app/(app)/accounts-glance-card";
import { CooliconPaths } from "@/app/(app)/coolicon";
import { GoalsCard } from "@/app/(app)/goals-card";

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

  // getCurrentSession() reads the JWT from cookies with no network call,
  // unlike getUser() — the layout above (and proxy.ts's middleware before
  // that) already did the real, network-validated auth check for this
  // request. It's also cache()-wrapped, so this reuses the exact call the
  // layout already made for the same request instead of decoding it twice.
  // None of the data queries below depend on the session or on periods, so
  // everything fires in one batch instead of waiting on auth first — only
  // the profile lookup genuinely needs the session's user id, so that one
  // stays sequential after (and is itself cache()-deduped against the
  // layout's own profile lookup).
  const [
    session,
    periods,
    accounts,
    categories,
    summary,
    previousSummary,
    categoryProgress,
    transactions,
    balanceHistory,
    savingsTransfers,
    previousSavingsTransfers,
    objectives,
    loans,
  ] = await Promise.all([
    getCurrentSession(),
    getPeriods(),
    getAccountsWithBalances(),
    getCategories(),
    getPeriodSummaryForRange(range.start, range.end),
    getPeriodSummaryForRange(previousRange.start, previousRange.end),
    getCategoryProgressForRange(range.start, range.end),
    getTransactionsForRange(range.start, range.end),
    getBalanceHistory(90),
    getSavingsTransferTotal(range.start, range.end),
    getSavingsTransferTotal(previousRange.start, previousRange.end),
    getObjectives(),
    getLoanSummaries(),
  ]);
  const user = session?.user ?? null;
  const profile = user ? await getCurrentUserProfile(user.id) : null;
  const firstName =
    profile?.display_name?.trim() ||
    (user?.email ? firstNameFromEmail(user.email) : "there");

  const currentPeriod = pickPeriod(periods);

  const activeAccounts = accounts.filter((a) => a.is_active);

  // Planned amounts live on a single period (budget_lines), so they're only
  // directly editable here when the visible range is exactly one existing
  // period — a multi-month range's "planned" is a sum with no one row to edit.
  const editablePeriod =
    periods.find(
      (p) => p.start_date === range.start && p.end_date === range.end,
    ) ?? null;


  // The Transactions page shows whatever's tagged with a period's id, not
  // whatever falls within its calendar dates — the two usually agree, but a
  // transaction can be manually assigned to a different period than its own
  // txn_date (a late entry backdated into last month, say), in which case a
  // date-range query here would silently disagree with what that page shows
  // for the same month. Querying by period_id instead — whenever the visible
  // range actually corresponds to one — keeps this list exactly in sync with
  // it; only a range with no matching period (90 days, YTD, an arbitrary
  // custom span) falls back to the date-range result, since there's no
  // single period to match there anyway.
  const recentTransactionsSource = editablePeriod
    ? await getTransactions(editablePeriod.id)
    : transactions;
  // More than would ever fit visibly — the card trims itself to whatever
  // height matches the Budget card next to it.
  const recentTransactions = recentTransactionsSource.slice(0, 30);
  // So the detail panel can tell a split transaction apart from a plain
  // uncategorized one — see TransactionDetailModal's `splits` prop.
  const splitsByTransaction = await getSplitsByTransaction(
    recentTransactions.filter((t) => t.category_id === null).map((t) => t.id),
  );

  // Net worth = every active account's balance summed together, not budget
  // remaining. A debt account's `balance` is money owed, a liability — it
  // subtracts here instead of adding, or a credit card balance would
  // inflate this figure instead of reducing it.
  const netWorth = activeAccounts.reduce(
    (sum, a) => sum + (a.is_debt ? -a.balance : a.balance),
    0,
  );
  // Home equity (estimated value minus what's still owed on the mortgage) —
  // null on a loan until someone sets an estimate, so those contribute 0
  // rather than dragging the total down by the mortgage balance alone.
  // getBalanceHistory (below) has no notion of home equity — it's a
  // manually-set estimate with no historical time series, not something
  // derived from transaction history the way every other balance is — so
  // it's added on here rather than baked into that query. A loan's equity
  // didn't exist at all before its purchase_date, so any
  // date before that sees none of it (otherwise the month you actually
  // bought the house would show as a flat comparison, or a graph with a
  // phantom jump on a day nothing happened, instead of the real thing).
  function equityAsOf(dateIso: string): number {
    return loans.reduce((sum, s) => {
      if (s.equity === null) return sum;
      if (s.loan.purchase_date && dateIso < s.loan.purchase_date) return sum;
      return sum + s.equity;
    }, 0);
  }
  const totalEquity = equityAsOf(new Date().toISOString().slice(0, 10));
  const netWorthWithEquity = netWorth + totalEquity;
  // The sparkline is supposed to match the headline Net Worth figure it
  // graphs (see getBalanceHistory's own comment) — without this, the line's
  // right-most point silently disagreed with the big number above it by
  // however much home equity was worth, and the hover tooltip showed the
  // account-only total instead of the real one for that day.
  const balanceHistoryWithEquity = balanceHistory.map((p) => ({
    ...p,
    balance: p.balance + equityAsOf(p.date),
  }));
  // The trend note used to compare against last calendar month regardless
  // of what the graph next to it actually showed — a 90-day sparkline next
  // to a "from last month" label describing a different window entirely.
  // Comparing against the graph's own oldest point instead means the two
  // always agree: whatever span the line covers is the span the percentage
  // describes.
  const netWorthTrend =
    balanceHistoryWithEquity.length > 1
      ? trend(netWorthWithEquity, balanceHistoryWithEquity[0].balance)
      : null;
  const incomeTrend = trend(summary.income, previousSummary.income);
  const expenseTrend = trend(summary.expense, previousSummary.expense, {
    invert: true,
  });

  // Amount actually moved into savings this range vs. the same-length prior
  // range — the literal dollar total of transfers into savings-type
  // accounts (getSavingsTransferTotal), not a rate. Net, so a month with
  // more withdrawn than deposited correctly shows negative rather than
  // silently flooring at zero.
  const savedTrend = trend(savingsTransfers.net, previousSavingsTransfers.net);

  return (
    <div className="min-w-0 space-y-6">
      {/* Desktop-only — mobile has its own Overview tab (below) that's just
          the four cards and nothing else; the greeting/New-transaction row
          and the rest of this dashboard are reachable there via the other
          mobile tabs (Budget, Accounts, Add) instead. */}
      <div className="hidden lg:flex lg:items-start lg:justify-between lg:gap-4">
        <GreetingHeader firstName={firstName} />
        <div className="flex shrink-0 items-center gap-3">
          <NewTransactionButton
            variant="inline"
            menuAlign="right"
            initialContext={{
              periodId: currentPeriod?.id ?? null,
              periodStart: currentPeriod?.start_date ?? null,
              periodEnd: currentPeriod?.end_date ?? null,
              accounts: activeAccounts,
              categories,
            }}
          />
        </div>
      </div>

      {/* The mobile Overview tab is just this: the four headline cards,
          stacked. Same cards feed the desktop dashboard's own five-column
          row below at lg+ (Net Worth spans 2), so nothing here is
          duplicated — this is the only place they render. */}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:gap-4 2xl:grid-cols-5">
        <MetricCard
              label="Net Worth"
              index={0}
              className="2xl:col-span-2"
              value={
                <AnimatedMoney
                  value={netWorthWithEquity}
                  className={`text-balance-display ${netWorthWithEquity >= 0 ? "text-text" : "text-negative"}`}
                />
              }
              trendValue={netWorthTrend}
              trendLabel="in the last 90 days"
              badge={
                totalEquity !== 0 && (
                  <div className="text-right leading-tight">
                    <p className="tabular text-[11px] whitespace-nowrap text-text-faint">
                      Cash <span className="font-semibold text-text-muted">{formatMoney(netWorth)}</span>
                    </p>
                    <p className="tabular mt-0.5 text-[11px] whitespace-nowrap text-text-faint">
                      Equity <span className="font-semibold text-text-muted">{formatMoney(totalEquity)}</span>
                    </p>
                  </div>
                )
              }
              graph={
                balanceHistoryWithEquity.length > 1 && (
                  <Sparkline
                    points={balanceHistoryWithEquity}
                    color={
                      balanceHistoryWithEquity[balanceHistoryWithEquity.length - 1].balance >=
                      balanceHistoryWithEquity[0].balance
                        ? "var(--positive)"
                        : "var(--negative)"
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
              icon={<CooliconPaths name="Trending_Up" />}
              value={<AnimatedMoney value={summary.income} className="text-balance-display text-text" />}
              trendValue={incomeTrend}
            />

            <MetricCard
              label="Monthly Expenses"
              index={2}
              iconBg="var(--negative-bg)"
              iconColor="var(--negative-strong)"
              icon={<CooliconPaths name="Trending_Down" />}
              value={<AnimatedMoney value={summary.expense} className="text-balance-display text-text" />}
              trendValue={expenseTrend}
            />

            <MetricCard
              label="Saved This Month"
              index={3}
              iconBg="var(--projected-bg)"
              iconColor="var(--projected-strong)"
              icon={<CooliconPaths name="Shield_Check" />}
              value={
                <AnimatedMoney
                  value={savingsTransfers.net}
                  className={`text-balance-display ${
                    savingsTransfers.net >= 0 ? "text-text" : "text-negative"
                  }`}
                />
              }
              trendValue={savedTrend}
              badge={
                // Gross, not net — a real withdrawal should still surface here
                // even in a month where an unrelated deposit into some other
                // savings account happens to keep the net figure positive.
                savingsTransfers.withdrawn > 0 ? (
                  <span
                    className="tabular rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap"
                    style={{ backgroundColor: "var(--projected-bg)", color: "var(--projected-strong)" }}
                  >
                    {formatMoney(savingsTransfers.withdrawn)} Withdrawn
                  </span>
                ) : null
              }
            />
          </div>

          {/* Everything below is desktop-only — mobile's Overview tab is
              just the four cards above, nothing else; Budget/Recent Transactions/
              Accounts/Goals each live on their own dedicated mobile tab instead.
              The rail only appears as a true side column at xl+ — below that
              there's no room for a third column next to the metric cards, so it
              drops to full width below everything else instead. */}
          <div className="hidden lg:grid lg:grid-cols-1 lg:gap-6 xl:grid-cols-[minmax(0,1fr)_260px] xl:items-start">
            <div className="min-w-0 space-y-6">
              {/* Budget categories + recent transactions, side by side. Budget
                  dictates the pair's height (its own natural content size);
                  Recent Transactions is measured against it and trims to what
                  fits rather than growing the row — see DashboardEqualHeightRow
                  for why plain CSS stretch can't do this. */}
              <DashboardEqualHeightRow
                budget={
                  <BudgetCategoriesCard
                    categoryProgress={categoryProgress}
                    editablePeriodId={editablePeriod?.id ?? null}
                    rangeIsSinglePeriod={Boolean(editablePeriod)}
                  />
                }
                recent={
                  <div className="card flex h-full min-h-0 flex-col">
                    <div className="mb-4 flex shrink-0 items-center justify-between">
                      <p className="text-heading text-text">Recent Transactions</p>
                      <Link
                        href="/transactions"
                        className="text-xs font-medium text-text-faint hover:text-text"
                      >
                        View All
                      </Link>
                    </div>

                    {recentTransactions.length === 0 ? (
                      <EmptyState
                        compact
                        message="Nothing logged for this range yet."
                        shortcut={{ keys: ["⌥", "E"], label: "to log an expense from anywhere" }}
                      />
                    ) : (
                      <div className="min-h-0 flex-1 overflow-hidden">
                        <RecentTransactionsList
                          transactions={recentTransactions}
                          accounts={accounts}
                          categories={categories}
                          maxRows={8}
                          splitsByTransaction={splitsByTransaction}
                        />
                      </div>
                    )}
                  </div>
                }
              />
            </div>

            <div className="space-y-6">
              <AccountsGlanceCard accounts={activeAccounts} />
              <GoalsCard objectives={objectives} accounts={activeAccounts} />
            </div>
          </div>
    </div>
  );
}

function TrendArrow({ up }: { up: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={`shrink-0 ${up ? "" : "rotate-180"}`}
    >
      <path
        d="M12 19V5m0 0-6 6m6-6 6 6"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MetricCard({
  label,
  icon,
  iconBg,
  iconColor,
  value,
  trendValue,
  trendLabel = "from last month",
  graph,
  badge,
  className,
  index = 0,
}: {
  label: string;
  icon?: React.ReactNode;
  iconBg?: string;
  iconColor?: string;
  value: React.ReactNode;
  trendValue: Trend;
  // What the percentage is measured against — every card but Net Worth
  // compares to the prior calendar period, so that's the default; Net Worth
  // instead compares to the oldest point in its own 90-day graph, so its
  // label needs to say that instead or the two would describe different
  // windows next to each other.
  trendLabel?: string;
  graph?: React.ReactNode;
  // Small pill pinned to the top-right corner of the card, for a called-out
  // fact that doesn't fit the label/value/trend shape (e.g. a savings
  // withdrawal that dragged the rate down).
  badge?: React.ReactNode;
  className?: string;
  // Staggers this card's entrance behind the ones before it, so the row
  // reads left-to-right instead of every card fading in at once.
  index?: number;
}) {
  const trendNote = trendValue && (
    <p
      className={`mt-2 flex items-center gap-1 text-xs font-medium ${
        trendValue.good ? "text-positive" : "text-negative"
      }`}
    >
      <TrendArrow up={trendValue.pct >= 0} />
      {Math.abs(trendValue.pct).toFixed(1)}% {trendLabel}
    </p>
  );

  // Icon cards (Income/Expenses/Saved) use the reference layout: icon
  // pinned top-left, then the label/value/trend block anchored to the
  // bottom of the card. Net Worth has no icon and keeps its own top-down
  // layout instead, since its graph needs the middle space.
  if (icon) {
    return (
      <div
        style={{ animationDelay: `${index * 12}ms` }}
        className={`card card-hover animate-fade-in-up relative flex h-full flex-col justify-between ${className ?? ""}`}
      >
        {badge && <div className="absolute top-5 right-5 sm:top-6 sm:right-6">{badge}</div>}
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: iconBg, color: iconColor }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            {icon}
          </svg>
        </span>
        <div className="mt-4">
          <p className="text-[13px] font-medium whitespace-nowrap text-text-muted">{label}</p>
          <div className="mt-1">{value}</div>
          {trendNote}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{ animationDelay: `${index * 12}ms` }}
      className={`card card-hover animate-fade-in-up relative flex h-full flex-col ${className ?? ""}`}
    >
      {badge && <div className="absolute top-5 right-5 sm:top-6 sm:right-6">{badge}</div>}
      <p className="text-[13px] font-medium whitespace-nowrap text-text-muted">{label}</p>
      <div className="mt-5">{value}</div>
      {trendNote}
      {graph && <div className="mt-4">{graph}</div>}
    </div>
  );
}
