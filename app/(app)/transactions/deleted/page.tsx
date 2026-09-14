import { getAccounts, getCategories, getDeletedTransactions } from "@/lib/queries";
import { PageHeader } from "@/app/(app)/page-header";
import { EmptyState } from "@/app/(app)/empty-state";
import { DeletedTransactionsList } from "./deleted-transactions-list";

// Soft-deleted transactions never actually disappear (see the transactions
// table's own comment on deleted_at) — this is the one place to actually
// get one back once its own undo toast is long gone, or after a
// bulk-delete, which explicitly warns it isn't undoable in bulk from there.
export default async function DeletedTransactionsPage() {
  const [transactions, accounts, categories] = await Promise.all([
    getDeletedTransactions(),
    getAccounts(),
    getCategories(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recently deleted"
        description="Soft-deleted transactions stay here until restored — nothing here is gone for good."
      />

      {transactions.length === 0 ? (
        <div className="card">
          <EmptyState compact message="Nothing deleted recently." />
        </div>
      ) : (
        <div className="card-flush overflow-hidden">
          <div className="divide-y divide-border px-2 py-2 sm:px-4">
            <DeletedTransactionsList transactions={transactions} accounts={accounts} categories={categories} />
          </div>
        </div>
      )}
    </div>
  );
}
