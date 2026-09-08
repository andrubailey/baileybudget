import { getPeriods, pickPeriod } from "@/lib/periods";
import {
  getTransactions,
  getCategories,
  getAccountsWithBalances,
  getSplitsByTransaction,
  getPostedRecurringIds,
  getRecurringTransactions,
} from "@/lib/queries";
import { PeriodSwitcher } from "@/app/(app)/period-switcher";
import { PageTabs } from "@/app/(app)/page-tabs";
import { TransactionForm } from "./transaction-form";
import { TransactionsTable } from "./transactions-table";
import { ReassignToMeButton } from "./reassign-to-me-button";
import { AddRecurringForm } from "./add-recurring-form";
import { RecurringTable } from "./recurring-table";
import { TransactionsCalendar } from "./transactions-calendar";
import { CategoriesPanel } from "./categories-panel";
import type { Account, Category, Period } from "@/lib/types";

const TABS = [
  { value: "all", label: "All transactions" },
  { value: "recurring", label: "Recurring" },
  { value: "calendar", label: "Calendar" },
  { value: "categories", label: "Categories" },
];

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    period?: string;
    category?: string;
    account?: string;
    q?: string;
    highlight?: string;
  }>;
}) {
  const {
    view,
    period: requestedPeriod,
    category: initialCategoryFilter,
    account: initialAccountFilter,
    q: initialSearch,
    highlight: highlightId,
  } = await searchParams;
  const activeView = view ?? "all";
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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl leading-tight font-semibold tracking-tight text-text sm:text-display">Transactions</h1>
          <p className="mt-1 text-sm text-text-muted">
            Log income and expenses, manage recurring bills, and set category
            budgets.
          </p>
        </div>
        {activeView === "all" && <ReassignToMeButton />}
      </div>

      <PageTabs tabs={TABS} />

      {!period ? (
        <p className="text-sm text-text-muted">
          Couldn&apos;t set up this month&apos;s period automatically — try
          reloading the page.
        </p>
      ) : activeView === "recurring" ? (
        <RecurringView
          period={period}
          accounts={accounts}
          categories={categories}
        />
      ) : activeView === "calendar" ? (
        <CalendarView period={period} accounts={accounts} />
      ) : activeView === "categories" ? (
        <CategoriesPanel periods={periods} period={period} />
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
  const transactions = await getTransactions(period.id);
  const splitsByTransaction = await getSplitsByTransaction(
    transactions.filter((t) => t.category_id === null).map((t) => t.id),
  );

  return (
    <div className="space-y-6">
      <div className="flex sm:justify-end">
        <PeriodSwitcher periods={periods} selectedId={period.id} />
      </div>

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
        highlightId={highlightId}
      />
    </div>
  );
}

async function RecurringView({
  period,
  accounts,
  categories,
}: {
  period: Period;
  accounts: Account[];
  categories: Category[];
}) {
  const [items, postedIds] = await Promise.all([
    getRecurringTransactions(),
    getPostedRecurringIds(period.id),
  ]);

  return (
    <div className="space-y-6">
      <p className="text-sm text-text-muted">
        Bills, subscriptions, and paychecks that repeat every month.
      </p>
      <AddRecurringForm accounts={accounts} categories={categories} />
      <RecurringTable
        items={items}
        accounts={accounts}
        categories={categories}
        currentPeriodId={period.id}
        currentPeriodName={period.name}
        postedIds={postedIds}
      />
    </div>
  );
}

async function CalendarView({
  period,
  accounts,
}: {
  period: Period;
  accounts: Account[];
}) {
  const transactions = await getTransactions(period.id);
  return (
    <TransactionsCalendar
      periodStartDate={period.start_date}
      periodName={period.name}
      transactions={transactions}
      accounts={accounts}
    />
  );
}
