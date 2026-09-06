import Link from "next/link";
import { getPeriods, pickPeriod } from "@/lib/periods";
import {
  getAccountsWithBalances,
  getCategories,
  getCategoryProgress,
  getPeriodSummary,
  getTransactions,
} from "@/lib/queries";
import { formatMoney } from "@/lib/format";
import { PeriodSwitcher } from "@/app/(app)/period-switcher";
import { DashboardAccountList } from "@/app/(app)/dashboard-account-list";
import { QuickAddButton } from "@/app/(app)/quick-add";
import { ExpenseDonutChart } from "@/app/(app)/expense-donut";

const CATEGORY_COLORS = [
  "#9e77ed",
  "#f04438",
  "#0ba5ec",
  "#17b26a",
  "#4e5ba6",
  "#f79009",
];
const OTHER_COLOR = "#d5dde2";

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period: requestedPeriod } = await searchParams;
  const periods = await getPeriods();
  const period = pickPeriod(periods, requestedPeriod);

  if (!period) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold text-text">Welcome</h1>
        <p className="text-sm text-text-muted">
          Couldn&apos;t set up this month&apos;s period automatically — try
          reloading the page.
        </p>
      </div>
    );
  }

  const [accounts, categories, summary, categoryProgress, transactions] =
    await Promise.all([
      getAccountsWithBalances(),
      getCategories(),
      getPeriodSummary(period.id),
      getCategoryProgress(period.id),
      getTransactions(period.id),
    ]);

  const activeAccounts = accounts.filter((a) => a.is_active);
  const accountById = new Map(accounts.map((a) => [a.id, a.name]));

  // Build donut-chart segments from actual spend per category (top 6 + "Other").
  const spendingCategories = categoryProgress
    .filter((c) => c.actual > 0)
    .sort((a, b) => b.actual - a.actual);
  const top = spendingCategories.slice(0, 6);
  const rest = spendingCategories.slice(6);
  const restTotal = rest.reduce((sum, c) => sum + c.actual, 0);
  const segments = [
    ...top.map((c, i) => ({
      name: c.name,
      actual: c.actual,
      color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
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

  const recentTransactions = transactions.slice(0, 7);
  const totalPlanned = categoryProgress.reduce((sum, c) => sum + c.planned, 0);

  return (
    <div className="space-y-10">
      {/* Planned budget for the month */}
      <div className="flex items-center justify-between gap-4 rounded-xl border border-accent-border bg-accent-soft p-6">
        <div>
          <p className="text-sm font-medium text-accent">Planned this month</p>
          <p className="mt-1 text-sm text-text-muted">
            Total allocated across all of {period.name}&apos;s budget categories
          </p>
        </div>
        <p className="tabular text-[36px] leading-[44px] font-semibold tracking-[-0.72px] text-accent">
          {formatMoney(totalPlanned)}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[30px] font-semibold leading-[38px] text-text">
            {period.name}
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            {period.start_date} – {period.end_date}
          </p>
        </div>
        <PeriodSwitcher periods={periods} selectedId={period.id} />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
        <StatCard label="Net" value={summary.net} emphasize />
        <StatCard label="Income" value={summary.income} />
        <StatCard label="Expenses" value={summary.expense} />
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
        <QuickAddButton
          kind="income"
          periodId={period.id}
          accounts={activeAccounts}
          categories={categories}
        />
        <QuickAddButton
          kind="expense"
          periodId={period.id}
          accounts={activeAccounts}
          categories={categories}
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

      {/* Category breakdown + transactions */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[384px_1fr]">
        <div className="flex flex-col items-center gap-6 rounded-xl border border-border bg-surface p-5 shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)]">
          <div className="flex w-full items-center">
            <p className="text-base font-semibold text-text-2">Expenses by category</p>
          </div>
          {segments.length === 0 ? (
            <p className="py-16 text-sm text-text-muted">No expenses logged yet.</p>
          ) : (
            <ExpenseDonutChart segments={segments} />
          )}
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)]">
          <div className="flex items-center justify-between p-6">
            <div>
              <p className="text-lg font-semibold text-text">Recent transactions</p>
              <p className="text-sm text-text-muted">
                {period.name}, {transactions.length} logged
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
                {recentTransactions.map((t) => (
                  <tr key={t.id} className="border-b border-border last:border-b-0">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-black/5 bg-bg text-xs font-semibold text-text-faint">
                          {initials(t.description)}
                        </span>
                        <span className="text-sm font-medium text-text">
                          {t.description}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-3 text-sm text-text-muted">
                      {t.account_id ? accountById.get(t.account_id) : "—"}
                    </td>
                    <td className="px-6 py-3 text-sm text-text-muted">{t.txn_date}</td>
                    <td
                      className={`tabular px-6 py-3 text-right text-sm font-medium ${
                        t.kind === "income" ? "text-success" : "text-text"
                      }`}
                    >
                      {t.kind === "income" ? "+" : "-"}
                      {formatMoney(t.amount)}
                    </td>
                  </tr>
                ))}
                {recentTransactions.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-10 text-center text-sm text-text-muted">
                      No transactions logged for this period yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Accounts */}
      <div>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-text">Accounts</h2>
          <span className="tabular text-sm text-text-muted">
            {formatMoney(activeAccounts.reduce((sum, a) => sum + a.balance, 0))} total
          </span>
        </div>
        {activeAccounts.length === 0 ? (
          <p className="text-sm text-text-muted">
            No accounts yet.{" "}
            <Link href="/accounts" className="text-accent underline underline-offset-2">
              Add one
            </Link>
            .
          </p>
        ) : (
          <DashboardAccountList accounts={activeAccounts} />
        )}
      </div>

      {/* Budget categories */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-text">Budget categories</h2>
        <div className="divide-y divide-border rounded-xl border border-border bg-surface">
          {categoryProgress.map((c) => {
            const pct = c.planned > 0 ? Math.min(100, (c.actual / c.planned) * 100) : 0;
            return (
              <div key={c.id} className="px-5 py-4">
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-text">{c.name}</span>
                  <span
                    className={`tabular ${c.overBudget ? "text-[#f04438]" : "text-text-muted"}`}
                  >
                    {formatMoney(c.actual)}{" "}
                    <span className="text-text-faint">/ {formatMoney(c.planned)}</span>
                  </span>
                </div>
                <div className="mt-2 h-1.5 w-full rounded-full bg-bg">
                  <div
                    className="h-1.5 rounded-full"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: c.overBudget ? "#f04438" : "var(--accent)",
                    }}
                  />
                </div>
              </div>
            );
          })}
          {categoryProgress.length === 0 && (
            <p className="px-5 py-8 text-sm text-text-muted">
              No expense categories yet.{" "}
              <Link href="/categories" className="text-accent underline underline-offset-2">
                Add one
              </Link>
              .
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: number;
  emphasize?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-6 shadow-[0px_1px_1px_0px_rgba(16,24,40,0.05)]">
      <p className="text-sm font-medium text-text-muted">{label}</p>
      <p
        className={`tabular text-[36px] leading-[44px] font-semibold tracking-[-0.72px] ${
          emphasize ? "text-accent" : "text-text"
        }`}
      >
        {formatMoney(value)}
      </p>
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
