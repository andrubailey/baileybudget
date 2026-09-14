import { getAccountsWithBalances } from "@/lib/queries";
import { EmptyState } from "@/app/(app)/empty-state";
import { groupAccounts } from "@/app/(app)/accounts/account-groups";
import { AccountReconcileRow } from "./account-reconcile-row";

// The mobile Accounts screen — categorized the same way as the desktop
// (Business, Personal, then Debt; see groupAccounts), one card per group.
// Each row can be reconciled against what the bank shows, same as the
// desktop account cards' Reconcile button.
export default async function BalancesPage() {
  const accounts = await getAccountsWithBalances();
  const activeAccounts = accounts.filter((a) => a.is_active);

  if (activeAccounts.length === 0) {
    return (
      <div className="mx-auto max-w-md">
        <div className="card">
          <EmptyState compact icon="wallet" message="No accounts yet." />
        </div>
      </div>
    );
  }

  const groups = groupAccounts(activeAccounts);

  return (
    <div className="mx-auto max-w-md space-y-5">
      {groups.map((group) => (
        <div key={group.key} className="card">
          <p className="text-section-label mb-3">{group.label}</p>
          <div className="divide-y divide-border">
            {group.accounts.map((a, i) => (
              <AccountReconcileRow key={a.id} account={a} index={i} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
