import Link from "next/link";
import { getAccountsWithBalances } from "@/lib/queries";
import { formatMoney } from "@/lib/format";
import { EmptyState } from "@/app/(app)/empty-state";
import { BankLogo } from "@/app/(app)/accounts/bank-logo";

export default async function InvestmentsPage() {
  const accounts = await getAccountsWithBalances();
  const investmentAccounts = accounts.filter((a) => a.account_type === "investment" && a.is_active);
  const total = investmentAccounts.reduce((sum, a) => sum + a.balance, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-text">Investments</h1>
          <p className="mt-1 text-sm text-text-muted">
            Accounts tagged as Investment on the Accounts page.
          </p>
        </div>
        <Link
          href="/accounts"
          className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-text-muted transition-colors hover:bg-bg"
        >
          Manage accounts
        </Link>
      </div>

      {investmentAccounts.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-6 shadow-card">
          <EmptyState
            message="No investment accounts yet."
            action={
              <Link href="/accounts" className="text-xs text-accent underline underline-offset-2">
                Add an account and set its type to Investment
              </Link>
            }
          />
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-border bg-surface p-5 shadow-card">
            <p className="text-sm font-medium text-text-muted">Total invested</p>
            <p className="tabular mt-1 text-[28px] leading-9 font-semibold tracking-[-0.56px] text-text">
              {formatMoney(total)}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {investmentAccounts.map((a) => {
              const goalPct = a.goal && a.goal > 0 ? Math.min(100, Math.max(0, (a.balance / a.goal) * 100)) : null;
              return (
                <div key={a.id} className="rounded-xl border border-border bg-surface p-5 shadow-card">
                  <div className="flex items-center gap-2">
                    {a.bank && <BankLogo bank={a.bank} size="sm" />}
                    <span className="truncate text-sm font-medium text-text">{a.name}</span>
                  </div>
                  <p className="tabular mt-3 text-xl font-semibold text-text">{formatMoney(a.balance)}</p>
                  {goalPct !== null && (
                    <div className="mt-3">
                      <div className="h-1.5 rounded-full bg-bg">
                        <div
                          className="h-1.5 rounded-full bg-accent"
                          style={{ width: `${goalPct}%` }}
                        />
                      </div>
                      <p className="tabular mt-1.5 text-xs text-text-faint">
                        {formatMoney(a.balance)} / {formatMoney(a.goal!)} goal
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
