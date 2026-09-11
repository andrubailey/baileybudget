import { getPeriods, pickPeriod } from "@/lib/periods";
import { getAccounts, getCategories, getSplitsByTransaction, getTransactions } from "@/lib/queries";
import { EmptyState } from "@/app/(app)/empty-state";
import { RecentTransactionsList } from "@/app/(app)/recent-transactions-list";

// The mobile Recent tab — a straight, most-recent-first list for this
// month, reusing the same row/detail-panel machinery as the desktop
// dashboard's Recent Transactions card and the Transactions table's mobile
// cards. Deliberately no filters, no sort, no bulk actions — those are
// desktop's full /transactions page; this is a look-up, not a management
// screen.
export default async function RecentTransactionsPage() {
  const periods = await getPeriods();
  const period = pickPeriod(periods);

  if (!period) {
    return (
      <p className="text-sm text-text-muted">
        Couldn&apos;t set up this month&apos;s period automatically — try reloading the
        page.
      </p>
    );
  }

  const [transactions, accounts, categories] = await Promise.all([
    getTransactions(period.id),
    getAccounts(),
    getCategories(),
  ]);
  const splitsByTransaction = await getSplitsByTransaction(
    transactions.filter((t) => t.category_id === null).map((t) => t.id),
  );

  return (
    <div className="mx-auto max-w-md">
      <div className="card">
        <p className="mb-4 text-heading text-text">{period.name}</p>
        {transactions.length === 0 ? (
          <EmptyState compact message="Nothing logged this month yet." />
        ) : (
          <RecentTransactionsList
            transactions={transactions}
            accounts={accounts}
            categories={categories}
            maxRows={200}
            splitsByTransaction={splitsByTransaction}
          />
        )}
      </div>
    </div>
  );
}
