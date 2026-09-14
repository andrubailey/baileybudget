import { getPeriods, pickPeriod } from "@/lib/periods";
import {
  getTransactions,
  getAllTransactions,
  getTransactionsForRange,
  getCategories,
  getAccountsWithBalances,
  getSplitsByTransaction,
  getDueRecurringRows,
  type SplitDetail,
} from "@/lib/queries";
import { formatDate } from "@/lib/format";
import Link from "next/link";
import { RecurringPoster } from "./recurring-poster";
import { TransactionsTable } from "./transactions-table";
import { PageHeader } from "@/app/(app)/page-header";
import { SpendingTabs } from "@/app/(app)/spending/spending-tabs";
import type { Period, Transaction } from "@/lib/types";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

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
    // A date range and money-in/money-out filter — how every figure on the
    // Insights page links to exactly the transactions behind it.
    start?: string;
    end?: string;
    flow?: string;
  }>;
}) {
  const {
    period: requestedPeriod,
    category: initialCategoryFilter,
    account: initialAccountFilter,
    q: initialSearch,
    flag,
    highlight: highlightId,
    start,
    end,
    flow,
  } = await searchParams;
  const initialFlag =
    flag === "pending" || flag === "uncategorized" ? flag : undefined;
  const dateRange =
    start && end && ISO_DATE.test(start) && ISO_DATE.test(end) && start <= end ? { start, end } : null;
  const flowFilter = flow === "in" || flow === "out" ? flow : null;

  // accounts/categories don't depend on which period is selected, so they
  // run alongside the whole period → recurring-generation → transactions →
  // splits chain instead of it waiting on them first (or them waiting on
  // it) — these are two genuinely independent pieces of work that were
  // previously serialized just because they lived in the same component
  // tree, and that alone was adding a full extra round-trip's worth of
  // latency to the page every single load.
  const [periodData, accounts, categories, rangeTransactions] = await Promise.all([
    loadPeriodData(dateRange ? "all" : requestedPeriod, !dateRange),
    getAccountsWithBalances(),
    getCategories(),
    dateRange ? getTransactionsForRange(dateRange.start, dateRange.end) : Promise.resolve(null),
  ]);
  const { period, periods, dueRecurringCount } = periodData;
  let { transactions, splitsByTransaction, selectedPeriodId } = periodData;

  if (rangeTransactions) {
    // Same money-in/money-out rule as the rest of the app: a charge on a
    // debt account is stored as "income" but is money out, and a payment to
    // one isn't new spending at all.
    const debtIds = new Set(accounts.filter((a) => a.is_debt).map((a) => a.id));
    transactions = rangeTransactions.filter((t) => {
      if (!flowFilter) return true;
      if (t.kind !== "income" && t.kind !== "expense") return false;
      const isDebt = t.account_id ? debtIds.has(t.account_id) : false;
      const direction = !isDebt ? (t.kind === "income" ? "in" : "out") : t.kind === "income" ? "out" : null;
      return direction === flowFilter;
    });
    splitsByTransaction = await getSplitsByTransaction(
      transactions.filter((t) => t.category_id === null).map((t) => t.id),
    );
    selectedPeriodId = "all";
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Spending"
        description="Every income, expense and transfer. Click a row to see or edit it."
        actions={
          <Link
            href="/transactions/deleted"
            className="text-xs font-medium text-text-faint transition-colors hover:text-text"
          >
            Recently deleted
          </Link>
        }
      />
      <SpendingTabs />

      {dateRange && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm">
          <span className="text-text-muted">
            Showing{" "}
            <span className="font-medium text-text">
              {flowFilter === "in" ? "money in" : flowFilter === "out" ? "money out" : "all transactions"}
            </span>{" "}
            from <span className="tabular text-text">{formatDate(dateRange.start)}</span> to{" "}
            <span className="tabular text-text">{formatDate(dateRange.end)}</span>
          </span>
          <Link href="/transactions" className="text-xs font-medium text-accent hover:underline">
            Show this month instead
          </Link>
        </div>
      )}

      {!period ? (
        <p className="text-sm text-text-muted">
          Couldn&apos;t set up this month&apos;s period automatically — try
          reloading the page.
        </p>
      ) : (
        <>
        {dueRecurringCount > 0 && <RecurringPoster periodId={period.id} />}
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
          selectedPeriodId={selectedPeriodId}
        />
        </>
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
// `loadTransactions` is false when a date range supplies the rows instead.
async function loadPeriodData(
  requestedPeriod: string | undefined,
  loadTransactions = true,
): Promise<{
  period: Period | null;
  periods: Period[];
  transactions: Transaction[];
  splitsByTransaction: Map<string, SplitDetail[]>;
  dueRecurringCount: number;
  // A period id, or "all" for every month at once (e.g. an account's full
  // history, opened from its card on the Accounts page).
  selectedPeriodId: string;
}> {
  const periods = await getPeriods();
  const allTime = requestedPeriod === "all";
  // "All time" still needs the current month for posting due recurring bills.
  const period = pickPeriod(periods, allTime ? undefined : requestedPeriod);
  if (!period) {
    return {
      period: null,
      periods,
      transactions: [],
      splitsByTransaction: new Map(),
      dueRecurringCount: 0,
      selectedPeriodId: "",
    };
  }

  // Recurring bills that are due but not yet posted are inserted by a
  // Server Action fired from the client (RecurringPoster) rather than here
  // during render — a render can't invalidate the data cache, so an insert
  // made here wouldn't show up until something else changed. This read is
  // free (cached snapshot), and it's zero on the vast majority of loads.
  const [transactions, dueRows] = await Promise.all([
    !loadTransactions ? Promise.resolve([] as Transaction[]) : allTime ? getAllTransactions() : getTransactions(period.id),
    getDueRecurringRows(period.id),
  ]);
  const splitsByTransaction = await getSplitsByTransaction(
    transactions.filter((t) => t.category_id === null).map((t) => t.id),
  );

  return {
    period,
    periods,
    transactions,
    splitsByTransaction,
    dueRecurringCount: dueRows.length,
    selectedPeriodId: allTime ? "all" : period.id,
  };
}
