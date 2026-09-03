import { getPeriods, pickPeriod } from "@/lib/periods";
import { getTransactions, getCategoriesForPeriod, getAccountsWithBalances } from "@/lib/queries";
import { deleteTransaction } from "@/app/actions";
import { formatMoney } from "@/lib/format";
import { PeriodSwitcher } from "@/app/(app)/period-switcher";
import { TransactionForm } from "./transaction-form";

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
    period ? getCategoriesForPeriod(period.id) : Promise.resolve([]),
    period ? getTransactions(period.id) : Promise.resolve([]),
  ]);

  const accountById = new Map(accounts.map((a) => [a.id, a.name]));
  const categoryById = new Map(categories.map((c) => [c.id, c.name]));

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Transactions</h1>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            Log income and expenses as they happen.
          </p>
        </div>
        {period && <PeriodSwitcher periods={periods} selectedId={period.id} />}
      </div>

      {!period ? (
        <p className="text-sm text-black/50 dark:text-white/50">
          Create a period first from the Periods page.
        </p>
      ) : (
        <>
          <TransactionForm
            periodId={period.id}
            accounts={accounts.filter((a) => a.is_active)}
            categories={categories}
          />

          <div className="overflow-hidden rounded-xl border border-black/10 dark:border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-black/5 text-left dark:bg-white/5">
                <tr>
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 font-medium">Description</th>
                  <th className="px-4 py-2 font-medium">Category</th>
                  <th className="px-4 py-2 font-medium">Account</th>
                  <th className="px-4 py-2 font-medium">Tags</th>
                  <th className="px-4 py-2 text-right font-medium">Amount</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id} className="border-t border-black/10 dark:border-white/10">
                    <td className="px-4 py-2">{t.txn_date}</td>
                    <td className="px-4 py-2">{t.description}</td>
                    <td className="px-4 py-2">
                      {t.category_id ? categoryById.get(t.category_id) : "—"}
                    </td>
                    <td className="px-4 py-2">
                      {t.account_id ? accountById.get(t.account_id) : "—"}
                    </td>
                    <td className="px-4 py-2">
                      {t.tags.length > 0 ? t.tags.join(", ") : "—"}
                    </td>
                    <td
                      className={`px-4 py-2 text-right font-medium ${
                        t.kind === "income" ? "text-green-600" : ""
                      }`}
                    >
                      {t.kind === "income" ? "+" : "-"}
                      {formatMoney(t.amount)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <form action={deleteTransaction.bind(null, t.id)}>
                        <button
                          type="submit"
                          className="text-xs text-black/40 hover:text-red-600 dark:text-white/40"
                        >
                          Delete
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
                {transactions.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-black/50 dark:text-white/50">
                      No transactions logged for this period yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
