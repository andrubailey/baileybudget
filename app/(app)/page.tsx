import Link from "next/link";
import { getPeriods, pickPeriod } from "@/lib/periods";
import { resolveRange, getPreviousRange } from "@/lib/ranges";
import {
  getAccountsWithBalances,
  getCategories,
  getCategoryProgress,
  getCategoryProgressForRange,
  getMonthlyFlow,
  getObjectives,
  getPeriodSummaryForRange,
  getSafeToSpend,
  getTransactionsForRange,
  getUpcomingBills,
} from "@/lib/queries";
import { FinancialSnapshot } from "@/app/(app)/financial-snapshot";
import { BudgetCategoriesCard } from "@/app/(app)/budget-categories";
import { UpcomingBillsCard } from "@/app/(app)/upcoming-bills";
import { MoneyFlowChart } from "@/app/(app)/money-flow-chart";
import { RemainingMonthlyCard } from "@/app/(app)/remaining-monthly";
import { AnimatedMoney } from "@/app/(app)/animated-number";
import { formatMoney, formatDate } from "@/lib/format";
import { RangeSwitcher } from "@/app/(app)/range-switcher";
import { DashboardAccountList } from "@/app/(app)/dashboard-account-list";
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
    upcomingBills,
    monthlyFlow,
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
    currentPeriod ? getUpcomingBills(currentPeriod.id) : Promise.resolve([]),
    getMonthlyFlow(12),
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
    ...transactions
      .filter((t) => t.pending_approval)
      .map((t) => ({
        key: `pending-${t.id}`,
        message: `"${t.description}" (${formatMoney(t.amount)}) is flagged — ask before buying`,
        href: "/transactions",
        severity: 0.5,
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

        {/* Top row — My Balance / My Income / Total expense, the three
            headline cards a Fundcy-style dashboard leads with. */}
        <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-3">
          <div className="card-hover flex flex-col justify-between rounded-xl border border-border bg-surface p-5 sm:p-6 shadow-card">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-text-muted">My Balance</p>
              <span className="tabular rounded-full border border-border px-2.5 py-1 text-xs font-medium text-text-muted">
                {range.label}
              </span>
            </div>
            <div className="mt-6">
              <p className="text-xs text-text-faint">Total balance</p>
              <AnimatedMoney
                value={balance}
                className={`tabular text-[32px] leading-[40px] font-bold tracking-[-0.02em] ${
                  balance >= 0 ? "text-text" : "text-[#f04438]"
                }`}
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Chip label="Planned" value={formatMoney(totalPlanned)} />
              {balanceTrend && (
                <Chip
                  label={balanceTrend.pct >= 0 ? "Up" : "Down"}
                  value={`${Math.abs(balanceTrend.pct).toFixed(1)}%`}
                  tone={balanceTrend.good ? "success" : "danger"}
                />
              )}
            </div>
          </div>

          <div className="card-hover flex flex-col justify-between rounded-xl border border-border bg-surface p-5 sm:p-6 shadow-card">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-text-muted">My Income</p>
              <span className="text-xs text-text-faint">{range.label}</span>
            </div>
            <div className="mt-6">
              <p className="text-xs text-text-faint">Total income</p>
              <AnimatedMoney
                value={summary.income}
                className="tabular text-[32px] leading-[40px] font-bold tracking-[-0.02em] text-text"
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {incomeTrend && (
                <Chip
                  label={incomeTrend.pct >= 0 ? "Up" : "Down"}
                  value={`${Math.abs(incomeTrend.pct).toFixed(1)}%`}
                  tone={incomeTrend.good ? "success" : "danger"}
                />
              )}
              <Chip label="Safe to spend" value={formatMoney(safeToSpend)} />
            </div>
          </div>

          <div className="card-hover flex flex-col justify-between rounded-xl border border-border bg-surface p-5 sm:p-6 shadow-card">
            <div>
              <AnimatedMoney
                value={summary.expense}
                className="tabular text-[28px] leading-[36px] font-bold tracking-[-0.02em] text-text"
              />
              <p className="mt-1 text-xs text-text-faint">Total expense</p>
            </div>
            {pace ? (
              <div className="mt-5">
                <div className="flex justify-between text-[11px] text-text-faint">
                  <span>0</span>
                  <span>50</span>
                  <span>100</span>
                </div>
                <div className="mt-1 flex h-14 items-end gap-[3px]">
                  {Array.from({ length: 24 }, (_, i) => {
                    const barPct = ((i + 1) / 24) * 100;
                    const filled = barPct <= pace.spentPct;
                    return (
                      <div
                        key={i}
                        className="animate-bar-grow flex-1 rounded-sm"
                        style={{
                          height: `${20 + (i % 6) * 12}%`,
                          backgroundColor: filled ? "var(--accent-bright)" : "var(--border)",
                          animationDelay: `${i * 15}ms`,
                        }}
                      />
                    );
                  })}
                </div>
                <p className="mt-2 text-xs text-text-faint">
                  {range.label} · with a pace of {Math.round(pace.spentPct)}%
                </p>
              </div>
            ) : (
              <p className="mt-5 text-xs text-text-faint">Set planned amounts to track pace.</p>
            )}
          </div>
        </div>

        {/* Money Flow + Remaining Monthly — the two-column row a Fundcy-style
            dashboard leads with below its headline cards. Hidden only on
            true-mobile widths where the bars/tiles would be too cramped. */}
        <div className="hidden grid-cols-1 gap-6 sm:grid lg:grid-cols-[1fr_360px]">
          <div className="rounded-xl border border-border bg-surface p-5 shadow-card">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-heading text-text-2">Money Flow</p>
              <div className="flex items-center gap-4 text-xs text-text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full bg-[color:var(--tile-1-bg)]" /> Income
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full bg-[color:var(--accent-bright)]" /> Expense
                </span>
              </div>
            </div>
            <MoneyFlowChart points={monthlyFlow} />
          </div>

          <RemainingMonthlyCard
            spentPct={pace ? pace.spentPct : null}
            categoryProgress={currentPeriodProgress}
          />
        </div>

        {/* Category breakdown + full budget list — demoted below the summary
            row above, since it's detail you drill into rather than glance
            at. The donut is dropped on mobile to keep the budget list front
            and center there. */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[384px_1fr]">
          <div className="hidden flex-col items-center gap-6 rounded-xl border border-border bg-surface p-5 shadow-card lg:flex">
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
        <div className="min-w-0">
          <div className="mb-3 flex items-center justify-between sm:mb-0 sm:overflow-hidden sm:rounded-xl sm:border sm:border-border sm:bg-surface sm:p-6 sm:shadow-card">
            <div>
              <p className="text-heading text-text">Recent transactions</p>
              <p className="hidden text-sm text-text-muted sm:block">
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

          {/* Mobile: compact list, no horizontal scroll. Desktop: full table. */}
          <div className="space-y-2 sm:hidden">
            {recentTransactions.map((t) => {
              const avatar = getAvatarColors(t.id);
              return (
                <div
                  key={t.id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3 shadow-card"
                >
                  <span
                    className="relative flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
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
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text">{t.description}</p>
                    <p className="truncate text-xs text-text-faint">
                      {t.kind === "transfer"
                        ? `${t.account_id ? (accountById.get(t.account_id) ?? "—") : "—"} → ${t.to_account_id ? (accountById.get(t.to_account_id) ?? "—") : "—"}`
                        : t.account_id
                          ? (accountById.get(t.account_id) ?? "—")
                          : "—"}
                      {" · "}
                      {formatDate(t.txn_date)}
                    </p>
                  </div>
                  <span
                    className={`tabular shrink-0 text-sm font-medium ${
                      t.kind === "income" ? "text-success" : "text-text"
                    }`}
                  >
                    {t.kind === "income" ? "+" : t.kind === "expense" ? "-" : ""}
                    {formatMoney(t.amount)}
                  </span>
                </div>
              );
            })}
            {recentTransactions.length === 0 && (
              <p className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-text-muted">
                No transactions logged for this range yet.
              </p>
            )}
          </div>

          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border bg-bg">
                  <th className="px-6 py-2 text-xs font-medium text-text-muted">
                    Description
                  </th>
                  <th className="px-6 py-2 text-xs font-medium text-text-muted">Account</th>
                  <th className="px-6 py-2 text-xs font-medium text-text-muted">Date</th>
                  <th className="px-6 py-2 text-xs font-medium text-text-muted">Status</th>
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
                    <td className="px-6 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          t.cleared ? "bg-[#dcfae6] text-[#0b9055]" : "bg-[#fef0c7] text-[#93370d]"
                        }`}
                      >
                        {t.cleared ? "Completed" : "Pending"}
                      </span>
                    </td>
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
                    <td colSpan={5} className="px-6 py-10 text-center text-sm text-text-muted">
                      No transactions logged for this range yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Right sidebar: financial objectives above accounts. The 90-day
          snapshot and upcoming-bills preview duplicate dedicated pages
          (Recurring, Calendar), so they're dropped on mobile to stay light. */}
      <div className="space-y-10">
        <div className="hidden lg:block">
          <FinancialSnapshot
            summary={snapshotSummary}
            topCategory={
              topSnapshotCategory
                ? { name: topSnapshotCategory.name, actual: topSnapshotCategory.actual }
                : null
            }
          />
        </div>

        <div className="hidden lg:block">
          <UpcomingBillsCard bills={upcomingBills} categories={categories} />
        </div>

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

function Chip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "danger";
}) {
  const toneClass =
    tone === "success"
      ? "bg-[#dcfae6] text-[#0b9055]"
      : tone === "danger"
        ? "bg-[#fee4e2] text-[#b42318]"
        : "bg-bg text-text-muted";
  return (
    <span className={`tabular flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${toneClass}`}>
      <span className="opacity-70">{label}</span>
      {value}
    </span>
  );
}
