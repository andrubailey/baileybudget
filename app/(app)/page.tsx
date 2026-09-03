import Link from "next/link";
import { getPeriods, pickPeriod } from "@/lib/periods";
import {
  getAccountsWithBalances,
  getCategoryProgress,
  getPeriodSummary,
} from "@/lib/queries";
import { formatMoney } from "@/lib/format";
import { PeriodSwitcher } from "@/app/(app)/period-switcher";

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
        <h1 className="text-lg font-semibold">Welcome</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Start by creating your first period (month) on the{" "}
          <Link href="/periods" className="underline">
            Periods
          </Link>{" "}
          page.
        </p>
      </div>
    );
  }

  const [accounts, summary, categoryProgress] = await Promise.all([
    getAccountsWithBalances(),
    getPeriodSummary(period.id),
    getCategoryProgress(period.id),
  ]);

  const activeAccounts = accounts.filter((a) => a.is_active);
  const totalBalance = activeAccounts.reduce((sum, a) => sum + a.balance, 0);

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">{period.name}</h1>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            {period.start_date} – {period.end_date}
          </p>
        </div>
        <PeriodSwitcher periods={periods} selectedId={period.id} />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SummaryCard label="Income" value={formatMoney(summary.income)} />
        <SummaryCard label="Expenses" value={formatMoney(summary.expense)} />
        <SummaryCard
          label="Net"
          value={formatMoney(summary.net)}
          tone={summary.net >= 0 ? "positive" : "negative"}
        />
        <SummaryCard
          label="Savings rate"
          value={
            summary.savingsRate === null
              ? "—"
              : `${(summary.savingsRate * 100).toFixed(0)}%`
          }
        />
      </div>

      <div>
        <h2 className="text-sm font-medium text-black/70 dark:text-white/70">
          Accounts — {formatMoney(totalBalance)} total
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {activeAccounts.map((a) => {
            const goalPct =
              a.goal && a.goal > 0
                ? Math.min(100, Math.max(0, (a.balance / a.goal) * 100))
                : null;
            return (
              <div
                key={a.id}
                className="rounded-xl border border-black/10 p-4 dark:border-white/10"
              >
                <p className="text-sm text-black/60 dark:text-white/60">
                  {a.name}
                </p>
                <p className="mt-1 text-xl font-semibold">
                  {formatMoney(a.balance)}
                </p>
                {goalPct !== null && (
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-black/50 dark:text-white/50">
                      <span>
                        {formatMoney(a.balance)} / {formatMoney(a.goal!)}
                      </span>
                      <span>{goalPct.toFixed(0)}%</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full rounded-full bg-black/10 dark:bg-white/10">
                      <div
                        className="h-1.5 rounded-full bg-black dark:bg-white"
                        style={{ width: `${goalPct}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {activeAccounts.length === 0 && (
            <p className="text-sm text-black/50 dark:text-white/50">
              No accounts yet.{" "}
              <Link href="/accounts" className="underline">
                Add one
              </Link>
              .
            </p>
          )}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-medium text-black/70 dark:text-white/70">
          Budget categories
        </h2>
        <div className="mt-3 space-y-3">
          {categoryProgress.map((c) => {
            const pct = c.planned > 0 ? Math.min(100, (c.actual / c.planned) * 100) : 0;
            return (
              <div key={c.id}>
                <div className="flex justify-between text-sm">
                  <span>{c.name}</span>
                  <span
                    className={c.overBudget ? "text-red-600" : "text-black/60 dark:text-white/60"}
                  >
                    {formatMoney(c.actual)} / {formatMoney(c.planned)}
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full rounded-full bg-black/10 dark:bg-white/10">
                  <div
                    className={`h-1.5 rounded-full ${c.overBudget ? "bg-red-600" : "bg-black dark:bg-white"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
          {categoryProgress.length === 0 && (
            <p className="text-sm text-black/50 dark:text-white/50">
              No expense categories yet.{" "}
              <Link href="/categories" className="underline">
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

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative";
}) {
  const toneClass =
    tone === "positive"
      ? "text-green-600"
      : tone === "negative"
        ? "text-red-600"
        : "";
  return (
    <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
      <p className="text-xs text-black/60 dark:text-white/60">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}
