import { getPeriods, pickPeriod } from "@/lib/periods";
import {
  getTransactions,
  getCategories,
  getAccountsWithBalances,
  getSplitsByTransaction,
  generateRecurringForPeriod,
  type SplitDetail,
} from "@/lib/queries";
import { TransactionsTable } from "./transactions-table";
import { PageHeader } from "@/app/(app)/page-header";
import type { Period, Transaction } from "@/lib/types";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    period?: string;
    category?: string;
    account?: string;
    q?: string;
    flag?: string;
    highlight?: string;
  }>;
}) {
  const {
    period: requestedPeriod,
    category: initialCategoryFilter,
    account: initialAccountFilter,
    q: initialSearch,
    flag,
    highlight: highlightId,
  } = await searchParams;
  const initialFlag =
    flag === "pending" || flag === "uncategorized" ? flag : undefined;

  // accounts/categories don't depend on which period is selected, so they
  // run alongside the whole period → recurring-generation → transactions →
  // splits chain instead of it waiting on them first (or them waiting on
  // it) — these are two genuinely independent pieces of work that were
  // previously serialized just because they lived in the same component
  // tree, and that alone was adding a full extra round-trip's worth of
  // latency to the page every single load.
  const [periodData, accounts, categories] = await Promise.all([
    loadPeriodData(requestedPeriod),
    getAccountsWithBalances(),
    getCategories(),
  ]);
  const { period, periods, transactions, splitsByTransaction } = periodData;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transactions"
        description="Every income, expense and transfer. Click a row to see or edit it."
      />

      {!period ? (
        <p className="text-sm text-text-muted">
          Couldn&apos;t set up this month&apos;s period automatically — try
          reloading the page.
        </p>
      ) : (
        <TransactionsTable
          transactions={transactions}
          accounts={accounts}
          categories={categories}
          splitsByTransaction={splitsByTransaction}
          initialCategoryFilter={initialCategoryFilter}
          initialAccountFilter={initialAccountFilter}
          initialSearch={initialSearch}
          initialFlag={initialFlag}
          highlightId={highlightId}
          periods={periods}
          selectedPeriodId={period.id}
        />
      )}
    </div>
  );
}

// The genuinely sequential part of the page — picking a period has to
// happen before generating that period's recurring bills, which has to
// happen before reading its transactions (so newly-generated bills are
// included), which has to happen before reading their splits (so their ids
// are known). Isolated into its own function so the caller can run it
// alongside the unrelated accounts/categories fetches instead of after them.
async function loadPeriodData(requestedPeriod: string | undefined): Promise<{
  period: Period | null;
  periods: Period[];
  transactions: Transaction[];
  splitsByTransaction: Map<string, SplitDetail[]>;
}> {
  const periods = await getPeriods();
  const period = pickPeriod(periods, requestedPeriod);
  if (!period) {
    return { period: null, periods, transactions: [], splitsByTransaction: new Map() };
  }

  // Best-effort: post any due recurring bills for this period before
  // loading the list, so the "Make this recurring" checkbox is a
  // complete replacement for the old manual "Generate for period" button.
  await generateRecurringForPeriod(period.id);

  const transactions = await getTransactions(period.id);
  const splitsByTransaction = await getSplitsByTransaction(
    transactions.filter((t) => t.category_id === null).map((t) => t.id),
  );

  return { period, periods, transactions, splitsByTransaction };
}
