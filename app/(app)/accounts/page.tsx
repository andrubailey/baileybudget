import { getAccountsWithBalances } from "@/lib/queries";
import { PageHeader } from "@/app/(app)/page-header";
import { BANK_OPTIONS } from "@/lib/types";
import { AccountList } from "./account-list";
import { AddAccountForm } from "./add-account-form";

export default async function AccountsPage() {
  const accounts = await getAccountsWithBalances();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Accounts"
        description="Bank accounts, cards, or savings goals. Balances update automatically from transactions — use Reconcile on a card when the bank disagrees."
        actions={<AddAccountForm />}
      />

      <AccountList accounts={accounts} bankOptions={BANK_OPTIONS} />
    </div>
  );
}
