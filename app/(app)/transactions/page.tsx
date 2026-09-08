import { getPeriods, pickPeriod } from "@/lib/periods";
import {
  getTransactions,
  getCategories,
  getAccountsWithBalances,
  getSplitsByTransaction,
  generateRecurringForPeriod,
} from "@/lib/queries";
import { TransactionForm } from "./transaction-form";
import { TransactionsTable } from "./transactions-table";
import type { Account, Category, Period } from "@/lib/types";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    period?: string;
    category?: string;
    account?: string;
    q?: string;
    highlight?: string;
  }>;
}) {
  const {
    period: requestedPeriod,
    category: initialCategoryFilter,
    account: initialAccountFilter,
    q: initialSearch,
    highlight: highlightId,
  } = await searchParams;
  // periods and accounts/categories are independent — fetch together
  // instead of waiting on periods first.
  const [periods, accounts, categories] = await Promise.all([
    getPeriods(),
    getAccountsWithBalances(),
    getCategories(),
  ]);
  const period = pickPeriod(periods, requestedPeriod);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl leading-tight font-semibold tracking-tight text-text sm:text-display">Transactions</h1>
        <p className="mt-1 text-sm text-text-muted">
          Log income and expenses, manage recurring bills, and set category
          budgets.
        </p>
      </div>

      {!period ? (
        <p className="text-sm text-text-muted">
          Couldn&apos;t set up this month&apos;s period automatically — try
          reloading the page.
        </p>
      ) : (
        <AllTransactionsView
          period={period}
          periods={periods}
          accounts={accounts}
          categories={categories}
          initialCategoryFilter={initialCategoryFilter}
          initialAccountFilter={initialAccountFilter}
          initialSearch={initialSearch}
          highlightId={highlightId}
        />
      )}
    </div>
  );
}

async function AllTransactionsView({
  period,
  periods,
  accounts,
  categories,
  initialCategoryFilter,
  initialAccountFilter,
  initialSearch,
  highlightId,
}: {
  period: Period;
  periods: Period[];
  accounts: Account[];
  categories: Category[];
  initialCategoryFilter?: string;
  initialAccountFilter?: string;
  initialSearch?: string;
  highlightId?: string;
}) {
  // Best-effort: post any due recurring bills for this period before
  // loading the list, so the "Make this recurring" checkbox is a
  // complete replacement for the old manual "Generate for period" button.
  await generateRecurringForPeriod(period.id);

  const transactions = await getTransactions(period.id);
  const splitsByTransaction = await getSplitsByTransaction(
    transactions.filter((t) => t.category_id === null).map((t) => t.id),
  );

  return (
    <div className="space-y-6">
      <TransactionsTable
        transactions={transactions}
        accounts={accounts}
        categories={categories}
        splitsByTransaction={splitsByTransaction}
        initialCategoryFilter={initialCategoryFilter}
        initialAccountFilter={initialAccountFilter}
        initialSearch={initialSearch}
        highlightId={highlightId}
        periods={periods}
        selectedPeriodId={period.id}
      />

      <TransactionForm
        periodId={period.id}
        accounts={accounts.filter((a) => a.is_active)}
        categories={categories}
      />
    </div>
  );
}
