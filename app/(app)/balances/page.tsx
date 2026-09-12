import { getAccountsWithBalances } from "@/lib/queries";
import { BANK_OPTIONS } from "@/lib/types";
import { EmptyState } from "@/app/(app)/empty-state";
import { BankLogo } from "@/app/(app)/accounts/bank-logo";
import { AccountReconcileRow } from "./account-reconcile-row";

// The mobile Accounts screen — grouped by institution (the account's own
// `bank` field already means exactly that; no separate field needed) rather
// than the dashboard rail's Personal/Business/Debt split, since "which bank
// tab do I need to open to check this" is the question this screen answers.
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

  const groups = new Map<string, typeof activeAccounts>();
  for (const a of activeAccounts) {
    const key = a.bank ?? "Other";
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }
  // Chase, CIT Bank, then Amex — BANK_OPTIONS is already in that order;
  // a bank not in the list sorts after every known one, "Other" last of all.
  const bankRank = (bank: string) => {
    const i = (BANK_OPTIONS as readonly string[]).indexOf(bank);
    return i === -1 ? BANK_OPTIONS.length : i;
  };
  const sortedGroups = [...groups.entries()].sort(([a], [b]) => {
    if (a === "Other") return 1;
    if (b === "Other") return -1;
    return bankRank(a) - bankRank(b) || a.localeCompare(b);
  });

  return (
    <div className="mx-auto max-w-md space-y-5">
      {sortedGroups.map(([bank, accts]) => (
        <div key={bank} className="card">
          <div className="mb-3 flex items-center gap-2.5">
            {bank !== "Other" && <BankLogo bank={bank} size="sm" />}
            <p className="text-section-label">{bank}</p>
          </div>
          <div className="divide-y divide-border">
            {accts.map((a, i) => (
              <AccountReconcileRow key={a.id} account={a} index={i} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
