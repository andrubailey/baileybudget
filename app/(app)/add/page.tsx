import { getPeriods, pickPeriod } from "@/lib/periods";
import { getAccountsWithBalances, getCategories } from "@/lib/queries";
import { QuickAddButton } from "@/app/(app)/quick-add";
import { QuickAddTransferButton } from "@/app/(app)/quick-add-transfer";

// The mobile Add tab — three big buttons and nothing else, reusing the same
// quick-add modals every other "add a transaction" entry point in the app
// uses. Not linked from the desktop sidebar (desktop already has the
// "New transaction" button in its header), but works fine there too since
// it's just these three cards.
export default async function AddPage() {
  const [periods, accounts, categories] = await Promise.all([
    getPeriods(),
    getAccountsWithBalances(),
    getCategories(),
  ]);
  const period = pickPeriod(periods);

  if (!period) {
    return (
      <p className="text-sm text-text-muted">
        Couldn&apos;t set up this month&apos;s period automatically — try reloading the
        page.
      </p>
    );
  }

  const activeAccounts = accounts.filter((a) => a.is_active);

  return (
    <div className="mx-auto max-w-md space-y-6">
      <QuickAddButton
        kind="expense"
        periodId={period.id}
        accounts={activeAccounts}
        categories={categories}
      />
      <QuickAddButton
        kind="income"
        periodId={period.id}
        accounts={activeAccounts}
        categories={categories}
      />
      <QuickAddTransferButton periodId={period.id} accounts={activeAccounts} />
    </div>
  );
}
