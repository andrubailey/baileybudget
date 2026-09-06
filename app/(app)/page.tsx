import Link from "next/link";
import { getPeriods, pickPeriod } from "@/lib/periods";
import { resolveRange, getPreviousRange } from "@/lib/ranges";
import {
  getAccountsWithBalances,
  getCategories,
  getCategoryProgress,
  getCategoryProgressForRange,
  getObjectives,
  getPeriodSummaryForRange,
  getSafeToSpend,
  getTransactionsForRange,
} from "@/lib/queries";
import { FinancialSnapshot } from "@/app/(app)/financial-snapshot";
import { BudgetCategoriesCard } from "@/app/(app)/budget-categories";
import { formatMoney, formatDate } from "@/lib/format";
import { RangeSwitcher } from "@/app/(app)/range-switcher";
import { DashboardAccountList } from "@/app/(app)/dashboard-account-list";
import { QuickAddButton } from "@/app/(app)/quick-add";
import { QuickAddTransferButton } from "@/app/(app)/quick-add-transfer";
import { ExpenseDonutChart } from "@/app/(app)/expense-donut";
import { ObjectivesSection } from "@/app/(app)/objectives-section";
import { getCategoryColor } from "@/lib/category-colors";
import { getAvatarColors } from "@/lib/avatar-colors";
import { NeedsAttention } from "@/app/(app)/needs-attention";
import { BankLogo } from "@/app/(app)/accounts/bank-logo";

const OTHER_COLOR = "#d5dde2";

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
}

type Trend = { pct: number; good: boolean } | null;

// Compares the current value against the prior period. `invert` is for
// metrics like expenses where a decrease is the good direction.
function trend(current: number, previous: number, opts?: { invert?: boolean }): Trend {
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
  const { range: requestedRange, start: customStart, end: customEnd } = await searchParams;
  const range = resolveRange(requestedRange, customStart, customEnd);
  const previousRange = getPreviousRange(range.start, range.end);

  // Quick Add always logs into the real current-month period, independent of
  // which analytics range is being viewed above.
  const periods = await getPeriods();
  const currentPeriod = pickPeriod(periods);

  // Fixed 90-day window for the sidebar snapshot, independent of whichever
  // range the main dashboard above is currently showing.
  const snapshotEnd = new Date();
  const snapshotStart = new Date(snapshotEnd);
  snapshotStart.setUTCDate(snapshotStart.getUTCDate() - 89);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const [
    accounts,
    categories,
    summary,
    previousSummary,
    categoryProgress,
    previousCategoryProgress,
    transactions,
    objectives,
    snapshotSummary,
    snapshotCategoryProgress,
    safeToSpend,
    currentPeriodProgress,
  ] = await Promise.all([
    getAccountsWithBalances(),
    getCategories(),
    getPeriodSummaryForRange(range.start, range.end),
    getPeriodSummaryForRange(previousRange.start, previousRange.end),
    getCategoryProgressForRange(range.start, range.end),
    getCategoryProgressForRange(previousRange.start, previousRange.end),
    getTransactionsForRange(range.start, range.end),
    getObjectives(),
    getPeriodSummaryForRange(iso(snapshotStart), iso(snapshotEnd)),
    getCategoryProgressForRange(iso(snapshotStart), iso(snapshotEnd)),
    currentPeriod ? getSafeToSpend(currentPeriod.id) : Promise.resolve(0),
    currentPeriod ? getCategoryProgress(currentPeriod.id) : Promise.resolve([]),
  ]);

  const topSnapshotCategory = snapshotCategoryProgress
    .filter((c) => c.actual > 0)
    .sort((a, b) => b.actual - a.actual)[0];

  // Pace: how far through the current month vs. how far through its budget,
  // so a normal-looking "Expenses" number doesn't hide that you're 25 days
  // into a 30-day month having already spent 90% of plan.
  let pace: { daysElapsedPct: number; spentPct: number } | null = null;
  if (currentPeriod) {
    const startMs = new Date(`${currentPeriod.start_date}T00:00:00Z`).getTime();
    const endMs = new Date(`${currentPeriod.end_date}T00:00:00Z`).getTime();
    const todayIso = new Date().toISOString().slice(0, 10);
    const nowMs = new Date(`${todayIso}T00:00:00Z`).getTime();
    const daysElapsedPct = Math.min(100, Math.max(0, ((nowMs - startMs) / (endMs - startMs)) * 100));
    const currentPlanned = currentPeriodProgress.reduce((sum, c) => sum + c.planned, 0);
    const currentActual = currentPeriodProgress.reduce((sum, c) => sum + c.actual, 0);
    if (currentPlanned > 0) {
      pace = { daysElapsedPct, spentPct: Math.min(150, (currentActual / currentPlanned) * 100) };
    }
  }

  const activeAccounts = accounts.filter((a) => a.is_active);
  const accountById = new Map(accounts.map((a) => [a.id, a.name]));
  const accountBankById = new Map(accounts.map((a) => [a.id, a.bank]));

  // Build donut-chart segments from actual spend per category (top 6 + "Other").
  const spendingCategories = categoryProgress
    .filter((c) => c.actual > 0)
    .sort((a, b) => b.actual - a.actual);
  const top = spendingCategories.slice(0, 6);
  const rest = spendingCategories.slice(6);
  const restTotal = rest.reduce((sum, c) => sum + c.actual, 0);
  const segments = [
    ...top.map((c) => ({
      name: c.name,
      actual: c.actual,
      color: getCategoryColor(c.id),
      transactions: c.transactions,
    })),
    ...(restTotal > 0
      ? [
          {
            name: "Other",
            actual: restTotal,
            color: OTHER_COLOR,
            transactions: rest.flatMap((c) => c.transactions),
          },
        ]
      : []),
  ];

  // Every category keeps one stable color (hashed from its id) so the
  // transactions table dot always matches the donut, regardless of rank.
  const categoryColorById = new Map<string, string>(
    categoryProgress.map((c) => [c.id, getCategoryColor(c.id)]),
  );

  const recentTransactions = transactions.slice(0, 7);
  const totalPlanned = categoryProgress.reduce((sum, c) => sum + c.planned, 0);
  const previousTotalPlanned = previousCategoryProgress.reduce((sum, c) => sum + c.planned, 0);

  // Planned amounts live on a single period (budget_lines), so they're only
  // directly editable here when the visible range is exactly one existing
  // period — a multi-month range's "planned" is a sum with no one row to edit.
  const editablePeriod =
    periods.find((p) => p.start_date === range.start && p.end_date === range.end) ?? null;

  // Balance = what's left of the budget once actual spend is subtracted —
  // not income minus expenses.
  const balance = totalPlanned - summary.expense;
  const previousBalance = previousTotalPlanned - previousSummary.expense;
  const balanceTrend = trend(balance, previousBalance);
  const incomeTrend = trend(summary.income, previousSummary.income);
  const expenseTrend = trend(summary.expense, previousSummary.expense, { invert: true });
  const plannedTrend = trend(totalPlanned, previousTotalPlanned);

  // Per-account net change within the selected range, so the sidebar can show
  // trajectory ("+$240 this period") instead of just a static balance.
  const periodDeltaByAccount = new Map<string, number>();
  for (const t of transactions) {
    if (t.kind === "transfer") {
      if (t.account_id) {
        periodDeltaByAccount.set(
          t.account_id,
          (periodDeltaByAccount.get(t.account_id) ?? 0) - t.amount,
        );
      }
      if (t.to_account_id) {
        periodDeltaByAccount.set(
          t.to_account_id,
          (periodDeltaByAccount.get(t.to_account_id) ?? 0) + t.amount,
        );
      }
      continue;
    }
    if (!t.account_id) continue;
    const delta = t.kind === "income" ? t.amount : -t.amount;
    periodDeltaByAccount.set(
      t.account_id,
      (periodDeltaByAccount.get(t.account_id) ?? 0) + delta,
    );
  }

  // `severity` is a normalized 0-1+ overage fraction so wildly different
  // metrics (dollars under a threshold, dollars over budget, days until due)
  // can still be sorted into one list without the worst cases getting lost
  // next to marginal ones.
  const attentionItems = [
    ...accounts
      .filter(
        (a) =>
          a.is_active && a.low_balance_alert != null && a.balance <= a.low_balance_alert,
      )
      .map((a) => ({
        key: `low-${a.id}`,
        message: `${a.name} is at or below its low-balance alert (${formatMoney(a.balance)} / ${formatMoney(a.low_balance_alert!)})`,
        href: "/accounts",
        severity: (a.low_balance_alert! - a.balance) / Math.max(a.low_balance_alert!, 1),
      })),
    ...categoryProgress
      .filter((c) => c.overBudget)
      .map((c) => ({
        key: `over-${c.id}`,
        message: `${c.name} is over budget (${formatMoney(c.actual)} of ${formatMoney(c.planned)})`,
        href: "/categories",
        severity: (c.actual - c.planned) / Math.max(c.planned, 1),
      })),
    ...objectives
      .filter((o) => {
        if (o.status === "Achieved" || !o.end_date) return false;
        const todayMs = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`).getTime();
        const endMs = new Date(`${o.end_date}T00:00:00Z`).getTime();
        const daysLeft = (endMs - todayMs) / 86_400_000;
        return daysLeft >= 0 && daysLeft <= 14;
      })
      .map((o) => {
        const todayMs = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`).getTime();
        const endMs = new Date(`${o.end_date}T00:00:00Z`).getTime();
        const daysLeft = (endMs - todayMs) / 86_400_000;
        return {
          key: `obj-${o.id}`,
          message: `"${o.name}" is due by ${formatDate(o.end_date!)}`,
          href: undefined,
          severity: (14 - daysLeft) / 14,
        };
      }),
  ].sort((a, b) => b.severity - a.severity);

  return (
    <div className="grid grid-cols-1 gap-10 xl:grid-cols-[1fr_minmax(280px,320px)] xl:items-start">
      <div className="min-w-0 space-y-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-display text-text">{range.label}</h1>
            <p className="mt-1 text-sm text-text-muted">
              {formatDate(range.start)} – {formatDate(range.end)}
            </p>
          </div>
          <RangeSwitcher selected={range.key} start={range.start} end={range.end} />
        </div>

        {attentionItems.length > 0 && <NeedsAttention items={attentionItems} />}

        {currentPeriod && (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-accent-border bg-accent-soft p-5">
            <div>
              <p className="text-sm font-medium text-accent">Safe to spend this month</p>
              <p className="tabular text-3xl font-semibold text-accent">{formatMoney(safeToSpend)}</p>
              <p className="mt-1 text-xs text-accent/80">
                Unspent budget left, minus bills still coming this month.
              </p>
            </div>
            {pace && (
              <div className="min-w-[220px]">
                <div className="tabular flex justify-between text-xs text-accent/80">
                  <span>{Math.round(pace.daysElapsedPct)}% of month elapsed</span>
                  <span>{Math.round(pace.spentPct)}% of budget spent</span>
                </div>
                <div className="relative mt-1 h-2 w-full rounded-full bg-white/50">
                  <div
                    className="absolute h-2 rounded-full bg-accent"
                    style={{ width: `${Math.min(100, pace.spentPct)}%` }}
                  />
                  <div
                    className="absolute top-0 h-2 w-0.5 bg-text"
                    style={{ left: `${pace.daysElapsedPct}%` }}
                    title="Today"
                  />
                </div>
                <p className="mt-1 text-xs font-medium text-accent">
                  {pace.spentPct > pace.daysElapsedPct + 10
                    ? "Spending ahead of pace"
                    : pace.spentPct < pace.daysElapsedPct - 10
                      ? "Spending under pace"
                      : "On pace"}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Stat cards */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Income"
            value={summary.income}
            trend={incomeTrend}
            iconBg="var(--accent-soft)"
            icon={
              <path
                d="M12 19V5m0 0-6 6m6-6 6 6"
                stroke="var(--accent)"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            }
          />
          <StatCard
            label="Expenses"
            value={summary.expense}
            trend={expenseTrend}
            iconBg="#fee4e2"
            icon={
              <path
                d="M12 5v14m0 0 6-6m-6 6-6-6"
                stroke="#f04438"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            }
          />
          <StatCard
            label="Planned"
            value={totalPlanned}
            trend={plannedTrend}
            iconBg="var(--accent-soft)"
            icon={
              <path
                d="M12 3a9 9 0 1 0 9 9M12 3v9l6.36-6.36A9 9 0 0 0 12 3Z"
                stroke="var(--accent)"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            }
          />
          <StatCard
            label="Balance"
            value={balance}
            trend={balanceTrend}
            colorBySign
            iconBg="var(--accent-soft)"
            icon={
              <path
                d="M4 7h16M6 7v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7M9 11v4m6-4v4"
                stroke="var(--accent)"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            }
          />
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <QuickAddButton
            kind="income"
            periodId={currentPeriod!.id}
            accounts={activeAccounts}
            categories={categories}
          />
          <QuickAddButton
            kind="expense"
            periodId={currentPeriod!.id}
            accounts={activeAccounts}
            categories={categories}
          />
          <QuickAddTransferButton
            periodId={currentPeriod!.id}
            accounts={activeAccounts}
          />
          <QuickAction
            href="/accounts"
            bg="#f9fafb"
            title="Manage accounts"
            subtitle="Balances, banks, and goals"
            icon={
              <path
                d="M3 10h18M6 6h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z"
                stroke="#516778"
                strokeWidth={1.6}
                strokeLinejoin="round"
              />
            }
          />
        </div>

        {/* Category breakdown + budget categories */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[384px_1fr]">
          <div className="flex flex-col items-center gap-6 rounded-xl border border-border bg-surface p-5 shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)]">
            <div className="flex w-full items-center">
              <p className="text-heading text-text-2">Expenses by category</p>
            </div>
            {segments.length === 0 ? (
              <div className="flex w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border py-16 text-center">
                <p className="text-sm text-text-muted">No expenses logged yet.</p>
              </div>
            ) : (
              <ExpenseDonutChart segments={segments} />
            )}
          </div>

          <BudgetCategoriesCard
            categoryProgress={categoryProgress}
            editablePeriodId={editablePeriod?.id ?? null}
            rangeIsSinglePeriod={Boolean(editablePeriod)}
          />
        </div>

        {/* Recent transactions */}
        <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-surface shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)]">
          <div className="flex items-center justify-between p-6">
            <div>
              <p className="text-heading text-text">Recent transactions</p>
              <p className="text-sm text-text-muted">
                {range.label}, {transactions.length} logged
              </p>
            </div>
            <Link
              href="/transactions"
              className="rounded-md border border-border px-3 py-1.5 text-sm font-semibold text-text-muted hover:bg-bg"
            >
              View all
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border bg-bg">
                  <th className="px-6 py-2 text-xs font-medium text-text-muted">
                    Description
                  </th>
                  <th className="px-6 py-2 text-xs font-medium text-text-muted">Account</th>
                  <th className="px-6 py-2 text-xs font-medium text-text-muted">Date</th>
                  <th className="px-6 py-2 text-right text-xs font-medium text-text-muted">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {recentTransactions.map((t) => {
                  const avatar = getAvatarColors(t.id);
                  return (
                  <tr key={t.id} className="border-b border-border last:border-b-0">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        <span
                          className="relative flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                          style={{ backgroundColor: avatar.bg, color: avatar.text }}
                        >
                          {initials(t.description)}
                          {t.category_id && categoryColorById.has(t.category_id) && (
                            <span
                              className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full border border-surface"
                              style={{ backgroundColor: categoryColorById.get(t.category_id) }}
                            />
                          )}
                        </span>
                        <span className="text-sm font-medium text-text">
                          {t.description}
                        </span>
                        {t.recurring_transaction_id && (
                          <span className="shrink-0 text-xs" title="Recurring">
                            🔁
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-3 text-sm text-text-muted">
                      {t.kind === "transfer" ? (
                        <div className="flex items-center gap-1.5">
                          {t.account_id && accountBankById.get(t.account_id) && (
                            <BankLogo bank={accountBankById.get(t.account_id)!} size="sm" />
                          )}
                          <span>{t.account_id ? (accountById.get(t.account_id) ?? "—") : "—"}</span>
                          <span>→</span>
                          {t.to_account_id && accountBankById.get(t.to_account_id) && (
                            <BankLogo bank={accountBankById.get(t.to_account_id)!} size="sm" />
                          )}
                          <span>
                            {t.to_account_id ? (accountById.get(t.to_account_id) ?? "—") : "—"}
                          </span>
                        </div>
                      ) : t.account_id ? (
                        <div className="flex items-center gap-1.5">
                          {accountBankById.get(t.account_id) && (
                            <BankLogo bank={accountBankById.get(t.account_id)!} size="sm" />
                          )}
                          <span>{accountById.get(t.account_id)}</span>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-6 py-3 text-sm text-text-muted">{formatDate(t.txn_date)}</td>
                    <td
                      className={`tabular px-6 py-3 text-right text-sm font-medium ${
                        t.kind === "income" ? "text-success" : "text-text"
                      }`}
                    >
                      {t.kind === "income" ? "+" : t.kind === "expense" ? "-" : ""}
                      {formatMoney(t.amount)}
                    </td>
                  </tr>
                  );
                })}
                {recentTransactions.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-10 text-center text-sm text-text-muted">
                      No transactions logged for this range yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Right sidebar: financial objectives above accounts */}
      <div className="space-y-10">
        <FinancialSnapshot
          summary={snapshotSummary}
          topCategory={
            topSnapshotCategory
              ? { name: topSnapshotCategory.name, actual: topSnapshotCategory.actual }
              : null
          }
        />

        <ObjectivesSection objectives={objectives} accounts={accounts} />

        <div className="space-y-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-heading text-text">Accounts</h2>
            <span className="tabular text-sm text-text-muted">
              {formatMoney(activeAccounts.reduce((sum, a) => sum + a.balance, 0))} total
            </span>
          </div>
          {activeAccounts.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border py-10 text-center">
              <p className="text-sm text-text-muted">No accounts yet.</p>
              <Link href="/accounts" className="text-xs text-accent underline underline-offset-2">
                Add one
              </Link>
            </div>
          ) : (
            <DashboardAccountList
              accounts={activeAccounts}
              periodDeltaByAccount={periodDeltaByAccount}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  trend,
  emphasize,
  colorBySign,
  icon,
  iconBg,
}: {
  label: string;
  value: number;
  trend?: Trend;
  emphasize?: boolean;
  colorBySign?: boolean;
  icon?: React.ReactNode;
  iconBg?: string;
}) {
  const valueColor = colorBySign
    ? value > 0
      ? "text-success"
      : value < 0
        ? "text-[#f04438]"
        : "text-text"
    : emphasize
      ? "text-accent"
      : "text-text";
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-6 shadow-[0px_1px_1px_0px_rgba(16,24,40,0.05)]">
      <div className="flex items-center gap-2.5">
        {icon && (
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: iconBg ?? "var(--accent-soft)" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              {icon}
            </svg>
          </span>
        )}
        <p className="text-sm font-medium text-text-muted">{label}</p>
      </div>
      <p className={`tabular text-[32px] leading-[40px] font-semibold tracking-[-0.64px] ${valueColor}`}>
        {formatMoney(value)}
      </p>
      {trend && (
        <p
          className={`tabular flex items-center gap-1 text-xs font-medium ${
            trend.good ? "text-success" : "text-[#f04438]"
          }`}
        >
          <span>{trend.pct >= 0 ? "▲" : "▼"}</span>
          {Math.abs(trend.pct).toFixed(1)}%
          <span className="font-normal text-text-faint">vs last period</span>
        </p>
      )}
    </div>
  );
}

function QuickAction({
  href,
  bg,
  title,
  subtitle,
  icon,
}: {
  href: string;
  bg: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-start gap-3 rounded-xl border border-border bg-surface p-5 shadow-[0px_1px_1px_0px_rgba(16,24,40,0.05)] transition-shadow hover:shadow-md"
    >
      <span
        className="flex size-12 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: bg }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          {icon}
        </svg>
      </span>
      <div>
        <p className="text-base font-semibold text-text-2">{title}</p>
        <p className="text-sm text-text-muted">{subtitle}</p>
      </div>
    </Link>
  );
}
