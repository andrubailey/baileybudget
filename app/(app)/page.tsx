import Link from "next/link";
import { getPeriods, pickPeriod } from "@/lib/periods";
import { resolveRange, getPreviousRange } from "@/lib/ranges";
import { getCurrentSession, getCurrentUserProfile } from "@/lib/profile";
import {
  getAccountsWithBalances,
  getBalanceHistory,
  getCategories,
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
import { formatMoney, firstNameFromEmail } from "@/lib/format";
import { BudgetCategoriesCard } from "@/app/(app)/budget-categories";
import { GoalBanner } from "@/app/(app)/goal-banner";
import { NewTransactionButton } from "@/app/(app)/new-transaction-button";
import { BankLogo } from "@/app/(app)/accounts/bank-logo";
import { EmptyState } from "@/app/(app)/empty-state";
import { Sparkline } from "@/app/(app)/sparkline";
import { RecentTransactionsList } from "@/app/(app)/recent-transactions-list";

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
    netWorthHistory,
    balanceHistory,
    objectives,
    savingsTransfers,
    previousSavingsTransfers,
  ] = await Promise.all([
    getCurrentSession(),
    getPeriods(),
    getAccountsWithBalances(),
    getCategories(),
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
  const user = session?.user ?? null;
  const profile = user ? await getCurrentUserProfile(user.id) : null;
  const firstName =
    profile?.display_name?.trim() ||
    (user?.email ? firstNameFromEmail(user.email) : "there");

  // Only used to find the prior period for the balance trend comparison.
  const currentPeriod = pickPeriod(periods);
  const previousPeriod = currentPeriod
    ? periods[periods.findIndex((p) => p.id === currentPeriod.id) + 1]
    : undefined;

  const activeAccounts = accounts.filter((a) => a.is_active);

  const recentTransactions = transactions.slice(0, 7);
  // Business/Personal grouping mirrors the Accounts card just below it — a
  // transaction inherits its own account's flag rather than showing which
  // account it's from as text.
  const accountBusinessById = new Map(accounts.map((a) => [a.id, a.is_business]));
  const recentBusiness = recentTransactions.filter(
    (t) => t.account_id && accountBusinessById.get(t.account_id),
  );
  const recentPersonal = recentTransactions.filter(
    (t) => !t.account_id || !accountBusinessById.get(t.account_id),
  );
  const recentGroups = [
    { key: "business", label: "Business", transactions: recentBusiness },
    { key: "personal", label: "Personal", transactions: recentPersonal },
  ].filter((g) => g.transactions.length > 0);

  // Planned amounts live on a single period (budget_lines), so they're only
  // directly editable here when the visible range is exactly one existing
  // period — a multi-month range's "planned" is a sum with no one row to edit.
  const editablePeriod =
    periods.find(
      (p) => p.start_date === range.start && p.end_date === range.end,
    ) ?? null;

  // Net worth = every active account's balance summed together, not budget
  // remaining — compared against last month's end-of-period snapshot
  // (transfers cancel out there, so it's the same total-across-accounts
  // figure) to show whether that total is trending up or down. A debt
  // account's `balance` is money owed, a liability — it subtracts here
  // instead of adding, or a credit card balance would inflate this figure
  // instead of reducing it.
  const netWorth = activeAccounts.reduce(
    (sum, a) => sum + (a.is_debt ? -a.balance : a.balance),
    0,
  );
  const previousNetWorth = previousPeriod
    ? (netWorthHistory.find((p) => p.periodId === previousPeriod.id)
        ?.netWorth ?? null)
    : null;
  const netWorthTrend =
    previousNetWorth !== null
      ? trend(netWorth, previousNetWorth)
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
  const savedTrend = trend(savingsTransfers, previousSavingsTransfers);

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <GreetingHeader firstName={firstName} />
        <div className="flex shrink-0 items-center gap-3">
          <Link
            href="/transactions"
            aria-label="Transactions needing approval"
            className="relative flex size-11 shrink-0 items-center justify-center rounded-full border border-border text-text-muted transition-colors hover:bg-bg hover:text-text"
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
          <NewTransactionButton
            variant="inline"
            menuAlign="right"
            initialContext={{
              periodId: currentPeriod?.id ?? null,
              accounts: activeAccounts,
              categories,
            }}
          />
        </div>
      </div>

      {/* Main content + a minimal accounts-at-a-glance rail on the right.
          The rail only appears as a true side column at xl+ — below that
          there's no room for a third column next to the metric cards, so it
          drops to full width below everything else instead. */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_260px] xl:items-start">
        <div className="min-w-0 space-y-6">
          {/* Five-column grid so Net Worth can span 2 columns — the largest,
          most important card — while the other three take 1 each. Deferred
          to 2xl (not xl) since the finances chat column now eats real
          content width on every page — at xl the cards were cramped enough
          to visually collide once that column is docked. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-5">
        <MetricCard
          label="Net Worth"
          index={0}
          className="2xl:col-span-2"
          value={
            <AnimatedMoney
              value={netWorth}
              className={`tabular text-[34px] leading-[40px] font-bold tracking-[-0.005em] ${
                netWorth >= 0 ? "text-text" : "text-danger"
              }`}
            />
          }
          trendValue={netWorthTrend}
          graph={
            balanceHistory.length > 1 && (
              <Sparkline
                points={balanceHistory}
                color={
                  balanceHistory[balanceHistory.length - 1].balance >=
                  balanceHistory[0].balance
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
              className="tabular text-[34px] leading-[40px] font-bold tracking-[-0.005em] text-text"
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
              className="tabular text-[34px] leading-[40px] font-bold tracking-[-0.005em] text-text"
            />
          }
          trendValue={expenseTrend}
        />

        <MetricCard
          label="Saved This Month"
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
            <AnimatedMoney
              value={savingsTransfers}
              className={`tabular text-[34px] leading-[40px] font-bold tracking-[-0.005em] ${
                savingsTransfers >= 0 ? "text-text" : "text-danger"
              }`}
            />
          }
          trendValue={savedTrend}
          badge={
            savingsTransfers < 0 ? (
              <span className="tabular rounded-full bg-negative-bg px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap text-negative-strong">
                withdrawn
              </span>
            ) : null
          }
        />
      </div>

      {/* Budget categories + recent transactions, side by side — at 2xl this
          lines up with the metric row above it on the same 5-column grid:
          Budget Categories spans 3 (under Net Worth + Monthly Income),
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

          {recentTransactions.length === 0 ? (
            <EmptyState message="No transactions logged for this range yet." />
          ) : (
            <RecentTransactionsList
              groups={recentGroups}
              accounts={accounts}
              categories={categories}
            />
          )}
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

// Grouped by Personal vs. Business, with debt accounts pulled into their own
// group regardless of which side they're on — "here's what you have" vs.
// "here's what you owe" is the mental split that actually matters when
// working through every account one by one, and a subtotal per group is real
// information the flat list never surfaced. One quiet line per account
// (name + balance) instead of a stacked mini-card, so the list stays a fast
// checklist rather than a scroll of repeated bars and big numbers.
// Preferred display order for the Personal group — checking first as the
// day-to-day account, then the two savings goals in the order they matter
// most, ending with the tax set-aside. Anything not in this list (a new
// personal account added later) just falls after these, alphabetically.
const PERSONAL_ACCOUNT_ORDER = [
  "Personal Checking",
  "Car Maintenance Fund",
  "Emergency Fund",
  "Tax Savings",
];

function byPersonalOrder(a: AccountWithBalance, b: AccountWithBalance) {
  const ai = PERSONAL_ACCOUNT_ORDER.indexOf(a.name);
  const bi = PERSONAL_ACCOUNT_ORDER.indexOf(b.name);
  if (ai !== -1 && bi !== -1) return ai - bi;
  if (ai !== -1) return -1;
  if (bi !== -1) return 1;
  return a.name.localeCompare(b.name);
}

function AccountsGlanceCard({ accounts }: { accounts: AccountWithBalance[] }) {
  if (accounts.length === 0) return null;

  const debt = accounts.filter((a) => a.is_debt);
  const groups: {
    key: string;
    label: string;
    accounts: AccountWithBalance[];
  }[] = [
    {
      key: "business",
      label: "Business",
      accounts: accounts
        .filter((a) => !a.is_debt && a.is_business)
        .sort((a, b) => a.name.localeCompare(b.name)),
    },
    {
      key: "personal",
      label: "Personal",
      accounts: accounts
        .filter((a) => !a.is_debt && !a.is_business)
        .sort(byPersonalOrder),
    },
  ].filter((g) => g.accounts.length > 0);

  if (debt.length > 0) {
    groups.push({
      key: "debt",
      label: "Debt",
      accounts: debt.slice().sort((a, b) => a.name.localeCompare(b.name)),
    });
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-card sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-heading text-text">Accounts</p>
        <Link
          href="/accounts"
          className="text-xs font-medium text-text-faint transition-colors hover:text-text"
        >
          View All
        </Link>
      </div>
      <div className="space-y-6">
        {(() => {
          let rowIndex = 0;
          return groups.map((group) => (
          <div key={group.key}>
            <p className="mb-2.5 text-[11px] font-semibold tracking-wide text-text-faint uppercase">
              {group.label}
            </p>
            <div className="divide-y divide-border">
              {group.accounts.map((a) => {
                const i = rowIndex++;
                return (
                <div
                  key={a.id}
                  style={{ animationDelay: `${i * 35}ms` }}
                  className="animate-fade-in-up flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                >
                  {a.bank && <BankLogo bank={a.bank} size="sm" />}
                  <span className="min-w-0 flex-1 truncate text-sm text-text-muted">
                    {a.name}
                  </span>
                  <span
                    className={`tabular shrink-0 text-sm font-semibold ${
                      a.is_debt ? "text-negative" : "text-text"
                    }`}
                  >
                    {a.is_debt ? "-" : ""}
                    {formatMoney(a.balance)}
                  </span>
                </div>
                );
              })}
            </div>
          </div>
          ));
        })()}
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
  graph?: React.ReactNode;
  footnote?: React.ReactNode;
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
  // bottom of the card. Net Worth has no icon and keeps its own
  // top-down layout instead, since its graph needs the middle space.
  if (icon) {
    return (
      <div
        style={{ animationDelay: `${index * 60}ms` }}
        className={`card-hover animate-fade-in-up relative flex h-full flex-col justify-between rounded-xl border border-border bg-surface p-5 shadow-card sm:p-6 ${className ?? ""}`}
      >
        {badge && (
          <div className="absolute top-5 right-5 sm:top-6 sm:right-6">
            {badge}
          </div>
        )}
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
      {graph && <div className="mt-4">{graph}</div>}
    </div>
  );
}

