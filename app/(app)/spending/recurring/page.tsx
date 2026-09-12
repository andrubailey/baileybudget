import { getPeriods, pickPeriod } from "@/lib/periods";
import { getAccounts, getCategories, getPostedRecurringIds, getRecurringTransactions } from "@/lib/queries";
import { PageHeader } from "@/app/(app)/page-header";
import { EmptyState } from "@/app/(app)/empty-state";
import { SpendingTabs } from "../spending-tabs";
import { RecurringList } from "./recurring-list";

export default async function RecurringPage() {
  const periods = await getPeriods();
  const period = pickPeriod(periods);

  const [rules, accounts, categories, postedIds] = await Promise.all([
    getRecurringTransactions(),
    getAccounts(),
    getCategories(),
    period ? getPostedRecurringIds(period.id) : Promise.resolve(new Set<string>()),
  ]);

  const accountsById = new Map(accounts.map((a) => [a.id, a]));
  const categoriesById = new Map(categories.map((c) => [c.id, c]));

  const active = rules.filter((r) => r.is_active);
  const paused = rules.filter((r) => !r.is_active);

  const monthlyTotal = active.reduce(
    (sum, r) => sum + (r.kind === "expense" ? r.amount : -r.amount),
    0,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Spending"
        description="Bills and income that repeat every month, and whether this month's copy has posted yet."
      />
      <SpendingTabs />

      <section className="card-flush overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5 sm:px-6">
          <p className="card-label text-text-faint">Recurring</p>
          <p className="text-sm font-medium text-text">
            {monthlyTotal >= 0 ? "+" : "-"}
            {Math.abs(monthlyTotal).toLocaleString("en-US", { style: "currency", currency: "USD" })}
            <span className="text-text-faint"> / mo net</span>
          </p>
        </div>

        {rules.length === 0 ? (
          <EmptyState message="No recurring bills or income set up yet. Mark a transaction as recurring to start one." />
        ) : (
          <div className="divide-y divide-border px-2 py-2 sm:px-4">
            <RecurringList
              active={active.map((rule) => ({
                rule,
                account: rule.account_id ? (accountsById.get(rule.account_id) ?? null) : null,
                category: rule.category_id ? (categoriesById.get(rule.category_id) ?? null) : null,
                postedThisPeriod: postedIds.has(rule.id),
              }))}
              paused={paused.map((rule) => ({
                rule,
                account: rule.account_id ? (accountsById.get(rule.account_id) ?? null) : null,
                category: rule.category_id ? (categoriesById.get(rule.category_id) ?? null) : null,
                postedThisPeriod: postedIds.has(rule.id),
              }))}
              accounts={accounts}
              categories={categories}
            />
          </div>
        )}
      </section>
    </div>
  );
}
