import { getPeriods, pickPeriod } from "@/lib/periods";
import {
  getTransactions,
  getCategories,
  getAccountsWithBalances,
  getSplitsByTransaction,
} from "@/lib/queries";
import { PeriodSwitcher } from "@/app/(app)/period-switcher";
import { TransactionForm } from "./transaction-form";
import { TransactionsTable } from "./transactions-table";
import { ReassignToMeButton } from "./reassign-to-me-button";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; category?: string; account?: string; q?: string }>;
}) {
  const {
    period: requestedPeriod,
    category: initialCategoryFilter,
    account: initialAccountFilter,
    q: initialSearch,
  } = await searchParams;
  const periods = await getPeriods();
  const period = pickPeriod(periods, requestedPeriod);

  const [accounts, categories, transactions] = await Promise.all([
    getAccountsWithBalances(),
    getCategories(),
    period ? getTransactions(period.id) : Promise.resolve([]),
  ]);

  const splitsByTransaction = await getSplitsByTransaction(
    transactions.filter((t) => t.category_id === null).map((t) => t.id),
  );

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-text">Transactions</h1>
          <p className="mt-1 text-sm text-text-muted">
            Log income and expenses as they happen.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ReassignToMeButton />
          {period && <PeriodSwitcher periods={periods} selectedId={period.id} />}
        </div>
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
            splitsByTransaction={splitsByTransaction}
            initialCategoryFilter={initialCategoryFilter}
            initialAccountFilter={initialAccountFilter}
            initialSearch={initialSearch}
          />
        </>
      )}
    </div>
  );
}
