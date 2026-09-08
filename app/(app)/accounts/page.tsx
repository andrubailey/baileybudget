import { getPeriods, pickPeriod } from "@/lib/periods";
import { getAccountsWithBalances } from "@/lib/queries";
import { BANK_OPTIONS } from "@/lib/types";
import { AccountList } from "./account-list";
import { AddAccountForm } from "./add-account-form";
import { AddTransferButton } from "./add-transfer-button";

export default async function AccountsPage() {
  const [accounts, periods] = await Promise.all([
    getAccountsWithBalances(),
    getPeriods(),
  ]);
  const period = pickPeriod(periods);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl leading-tight font-semibold tracking-tight text-text sm:text-display">Accounts</h1>
        <p className="mt-1 text-sm text-text-muted">
          Bank accounts, cards, or savings goals. Balance updates
          automatically from transactions.
        </p>
      </div>

      <div className="flex flex-wrap items-start gap-2">
        <AddAccountForm />
        {period && (
          <AddTransferButton
            periodId={period.id}
            accounts={accounts.filter((a) => a.is_active)}
          />
        )}
      </div>

      <AccountList accounts={accounts} bankOptions={BANK_OPTIONS} />
    </div>
  );
}
