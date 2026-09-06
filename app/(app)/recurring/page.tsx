import { getPeriods, pickPeriod } from "@/lib/periods";
import {
  getAccountsWithBalances,
  getCategories,
  getPostedRecurringIds,
  getRecurringTransactions,
} from "@/lib/queries";
import { AddRecurringForm } from "./add-recurring-form";
import { RecurringTable } from "./recurring-table";

export default async function RecurringPage() {
  const periods = await getPeriods();
  const period = pickPeriod(periods);

  const [items, accounts, categories, postedIds] = await Promise.all([
    getRecurringTransactions(),
    getAccountsWithBalances(),
    getCategories(),
    period ? getPostedRecurringIds(period.id) : Promise.resolve(new Set<string>()),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-text">Recurring Transactions</h1>
        <p className="mt-1 text-sm text-text-muted">
          Bills, subscriptions, and paychecks that repeat every month.
        </p>
      </div>

      <AddRecurringForm accounts={accounts} categories={categories} />

      {period && (
        <RecurringTable
          items={items}
          accounts={accounts}
          categories={categories}
          currentPeriodId={period.id}
          currentPeriodName={period.name}
          postedIds={postedIds}
        />
      )}
    </div>
  );
}
