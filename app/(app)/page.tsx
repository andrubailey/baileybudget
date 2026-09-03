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
        <h1 className="font-display text-2xl">Welcome</h1>
        <p className="text-sm text-text-muted">
          Start by creating your first period (month) on the{" "}
          <Link href="/periods" className="text-accent underline underline-offset-4">
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
  const netPositive = summary.net >= 0;

  return (
    <div className="space-y-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.15em] text-text-muted">
            {period.start_date} – {period.end_date}
          </p>
          <h1 className="font-display mt-1 text-4xl italic tracking-tight">
            {period.name}
          </h1>
        </div>
        <PeriodSwitcher periods={periods} selectedId={period.id} />
      </div>

      {/* Ledger-style summary strip */}
      <div className="grid grid-cols-2 divide-x divide-border overflow-hidden rounded-2xl border border-border bg-surface sm:grid-cols-4">
        <Stat label="Income" value={formatMoney(summary.income)} />
        <Stat label="Expenses" value={formatMoney(summary.expense)} />
        <Stat
          label="Net"
          value={formatMoney(summary.net)}
          tone={netPositive ? "positive" : "negative"}
          emphasis
        />
        <Stat
          label="Savings rate"
          value={
            summary.savingsRate === null
              ? "—"
              : `${(summary.savingsRate * 100).toFixed(0)}%`
          }
        />
      </div>

      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-xl">Accounts</h2>
          <span className="tabular text-sm text-text-muted">
            {formatMoney(totalBalance)} total
          </span>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {activeAccounts.map((a) => {
            const goalPct =
              a.goal && a.goal > 0
                ? Math.min(100, Math.max(0, (a.balance / a.goal) * 100))
                : null;
            return (
              <div
                key={a.id}
                className="relative overflow-hidden rounded-2xl border border-border bg-surface p-5"
              >
                <span className="absolute inset-x-0 top-0 h-[3px] bg-accent" />
                <div className="flex items-center gap-2">
                  <p className="text-sm text-text-muted">{a.name}</p>
                  {a.bank && (
                    <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent">
                      {a.bank}
                    </span>
                  )}
                </div>
                <p className="font-display tabular mt-1 text-2xl">
                  {formatMoney(a.balance)}
                </p>
                {goalPct !== null && (
                  <div className="mt-4">
                    <div className="tabular flex justify-between text-xs text-text-muted">
                      <span>
                        {formatMoney(a.balance)} / {formatMoney(a.goal!)}
                      </span>
                      <span>{goalPct.toFixed(0)}%</span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full rounded-full bg-surface-2">
                      <div
                        className="h-1.5 rounded-full bg-accent"
                        style={{ width: `${goalPct}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {activeAccounts.length === 0 && (
            <p className="text-sm text-text-muted">
              No accounts yet.{" "}
              <Link href="/accounts" className="text-accent underline underline-offset-4">
                Add one
              </Link>
              .
            </p>
          )}
        </div>
      </section>

      <section>
        <h2 className="font-display text-xl">Budget categories</h2>
        <div className="mt-4 divide-y divide-border rounded-2xl border border-border bg-surface">
          {categoryProgress.map((c) => {
            const pct =
              c.planned > 0 ? Math.min(100, (c.actual / c.planned) * 100) : 0;
            return (
              <div key={c.id} className="px-5 py-4">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">{c.name}</span>
                  <span
                    className={`tabular ${c.overBudget ? "text-negative" : "text-text-muted"}`}
                  >
                    {formatMoney(c.actual)}{" "}
                    <span className="text-text-muted">/ {formatMoney(c.planned)}</span>
                  </span>
                </div>
                <div className="mt-2 h-1.5 w-full rounded-full bg-surface-2">
                  <div
                    className={`h-1.5 rounded-full ${c.overBudget ? "bg-negative" : "bg-accent"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
          {categoryProgress.length === 0 && (
            <p className="px-5 py-6 text-sm text-text-muted">
              No expense categories yet.{" "}
              <Link href="/categories" className="text-accent underline underline-offset-4">
                Add one
              </Link>
              .
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  emphasis,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative";
  emphasis?: boolean;
}) {
  const toneClass =
    tone === "positive"
      ? "text-positive"
      : tone === "negative"
        ? "text-negative"
        : "text-text";
  return (
    <div className={`p-5 ${emphasis ? "bg-accent-soft" : ""}`}>
      <p className="text-xs font-medium uppercase tracking-[0.1em] text-text-muted">
        {label}
      </p>
      <p
        className={`font-display tabular mt-1 text-2xl ${toneClass} ${emphasis ? "text-3xl" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}
