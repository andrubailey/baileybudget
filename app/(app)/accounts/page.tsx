import { getAccountsWithBalances, getNetWorthHistory } from "@/lib/queries";
import { BANK_OPTIONS } from "@/lib/types";
import { AccountList } from "./account-list";
import { AddAccountForm } from "./add-account-form";
import { NetWorthChart } from "./net-worth-chart";

export default async function AccountsPage() {
  const [accounts, netWorthHistory] = await Promise.all([
    getAccountsWithBalances(),
    getNetWorthHistory(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text">Accounts</h1>
        <p className="mt-1 text-sm text-text-muted">
          Bank accounts, cards, or savings goals. Balance updates
          automatically from transactions.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-surface p-5 shadow-card">
        <h2 className="mb-3 text-sm font-medium text-text-muted">Net worth over time</h2>
        <NetWorthChart points={netWorthHistory} />
      </div>

      <AddAccountForm />

      <p className="text-xs text-text-faint">Drag a card to reorder your accounts.</p>
      <AccountList accounts={accounts} bankOptions={BANK_OPTIONS} />
    </div>
  );
}
