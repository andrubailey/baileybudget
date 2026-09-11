import { getAccountsWithBalances } from "@/lib/queries";
import { getLoanSummaries } from "@/lib/loans";
import { PageHeader } from "@/app/(app)/page-header";
import { BANK_OPTIONS } from "@/lib/types";
import { AccountList } from "./account-list";
import { AddAccountForm } from "./add-account-form";
import { MortgageCard } from "./mortgage-card";

export default async function AccountsPage() {
  const [accounts, loans] = await Promise.all([getAccountsWithBalances(), getLoanSummaries()]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Accounts"
        description="Bank accounts, cards, or savings goals. Balances update automatically from transactions — use Reconcile on a card when the bank disagrees."
        actions={<AddAccountForm />}
      />

      {loans.length > 0 ? (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]">
          <AccountList accounts={accounts} bankOptions={BANK_OPTIONS} withRail />
          <div className="space-y-6">
            {loans.map((summary) => (
              <MortgageCard key={summary.loan.id} summary={summary} />
            ))}
          </div>
        </div>
      ) : (
        <AccountList accounts={accounts} bankOptions={BANK_OPTIONS} />
      )}
    </div>
  );
}
