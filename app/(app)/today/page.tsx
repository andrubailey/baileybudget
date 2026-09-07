import Link from "next/link";
import { getPeriods, pickPeriod } from "@/lib/periods";
import { getSafeToSpend, getTransactionsForRange } from "@/lib/queries";
import { formatMoney } from "@/lib/format";
import { getAccountColor } from "@/lib/account-colors";
import { getAccountsWithBalances, getCategories } from "@/lib/queries";

// A stripped-down, one-screen view — safe-to-spend plus just today's
// activity — for a quick evening check-in from a phone, instead of parsing
// the full dashboard every time.
export default async function TodayPage() {
  const todayIso = new Date().toISOString().slice(0, 10);
  const periods = await getPeriods();
  const currentPeriod = pickPeriod(periods);

  const [safeToSpend, todaysTransactions, accounts, categories] = await Promise.all([
    currentPeriod ? getSafeToSpend(currentPeriod.id) : Promise.resolve(0),
    getTransactionsForRange(todayIso, todayIso),
    getAccountsWithBalances(),
    getCategories(),
  ]);

  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const categoryById = new Map(categories.map((c) => [c.id, c.name]));

  const todaysIncome = todaysTransactions
    .filter((t) => t.kind === "income")
    .reduce((sum, t) => sum + t.amount, 0);
  const todaysExpense = todaysTransactions
    .filter((t) => t.kind === "expense")
    .reduce((sum, t) => sum + t.amount, 0);

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text">Today</h1>
        <p className="mt-1 text-sm text-text-muted">
          {new Date(`${todayIso}T00:00:00Z`).toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            timeZone: "UTC",
          })}
        </p>
      </div>

      <div className="rounded-xl border border-accent-border bg-accent-soft p-6 text-center">
        <p className="text-sm font-medium text-accent">Safe to spend this month</p>
        <p className="tabular mt-1 text-4xl font-semibold text-accent">
          {formatMoney(safeToSpend)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-surface p-4 text-center">
          <p className="text-xs text-text-muted">Income today</p>
          <p className="tabular mt-1 text-lg font-semibold text-success">
            {formatMoney(todaysIncome)}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 text-center">
          <p className="text-xs text-text-muted">Spent today</p>
          <p className="tabular mt-1 text-lg font-semibold text-text">
            {formatMoney(todaysExpense)}
          </p>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-muted">Today&apos;s transactions</h2>
          <Link href="/transactions" className="text-xs font-medium text-accent hover:underline">
            All transactions →
          </Link>
        </div>
        <div className="divide-y divide-border rounded-xl border border-border bg-surface">
          {todaysTransactions.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-text-muted">
              Nothing logged yet today.
            </p>
          ) : (
            todaysTransactions.map((t) => {
              const account = t.account_id ? accountById.get(t.account_id) : undefined;
              return (
                <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                  {account && (
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: getAccountColor(account.account_type, account.is_debt) }}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text">{t.description}</p>
                    <p className="truncate text-xs text-text-faint">
                      {t.category_id ? categoryById.get(t.category_id) : account?.name ?? "—"}
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
            })
          )}
        </div>
      </div>
    </div>
  );
}
