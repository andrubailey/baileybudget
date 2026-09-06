import { getPeriods, pickPeriod } from "@/lib/periods";
import { getTransactions, getCategories, getAccountsWithBalances } from "@/lib/queries";
import { PeriodSwitcher } from "@/app/(app)/period-switcher";
import { TransactionForm } from "./transaction-form";
import { TransactionsTable } from "./transactions-table";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period: requestedPeriod } = await searchParams;
  const periods = await getPeriods();
  const period = pickPeriod(periods, requestedPeriod);

  const [accounts, categories, transactions] = await Promise.all([
    getAccountsWithBalances(),
    getCategories(),
    period ? getTransactions(period.id) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-text">Transactions</h1>
          <p className="mt-1 text-sm text-text-muted">
            Log income and expenses as they happen.
          </p>
        </div>
        {period && <PeriodSwitcher periods={periods} selectedId={period.id} />}
      </div>

      {!period ? (
        <p className="text-sm text-text-muted">
          Couldn&apos;t set up this month&apos;s period automatically — try
          reloading the page.
        </p>
      ) : (
        <>
          <TransactionForm
            periodId={period.id}
            accounts={accounts.filter((a) => a.is_active)}
            categories={categories}
          />

          <TransactionsTable
            transactions={transactions}
            accounts={accounts}
            categories={categories}
          />
        </>
      )}
    </div>
  );
}
