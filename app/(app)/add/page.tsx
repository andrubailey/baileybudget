import { getPeriods, pickPeriod } from "@/lib/periods";
import { getAccountsWithBalances, getCategories } from "@/lib/queries";
import { MobileAddSheet } from "./mobile-add-sheet";

// The mobile Add tab — a single bottom sheet (Expense/Transfer/Income,
// amount entered first) rather than three separate trigger cards each
// opening its own centered dialog. Reached by tapping the raised center
// button in the mobile tab bar; desktop keeps using the full quick-add
// modals via the sidebar's "New transaction" button and the ⌥E/⌥I/⌥T
// shortcuts, unchanged.
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

  return <MobileAddSheet periodId={period.id} accounts={activeAccounts} categories={categories} />;
}
