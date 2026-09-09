import { getAccountsWithBalances } from "@/lib/queries";
import { AccountsGlanceCard } from "@/app/(app)/accounts-glance-card";

// The mobile Balances tab — the same minimal "name + balance" list the
// dashboard's sidebar rail shows, standing alone instead of sharing space
// with the metric cards. The full account-management page (photos, goals,
// login links, reordering) stays desktop-only at /accounts.
export default async function BalancesPage() {
  const accounts = await getAccountsWithBalances();
  const activeAccounts = accounts.filter((a) => a.is_active);

  return (
    <div className="mx-auto max-w-md">
      <AccountsGlanceCard accounts={activeAccounts} />
    </div>
  );
}
