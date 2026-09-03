import { getPeriods, pickPeriod } from "@/lib/periods";
import { getTransactions, getCategories, getAccountsWithBalances } from "@/lib/queries";
import { deleteTransaction } from "@/app/actions";
import { formatMoney } from "@/lib/format";
import { PeriodSwitcher } from "@/app/(app)/period-switcher";
import { TransactionForm } from "./transaction-form";

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
}

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

  const accountById = new Map(accounts.map((a) => [a.id, a.name]));
  const categoryById = new Map(categories.map((c) => [c.id, c.name]));

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
          Create a period first from the Periods page.
        </p>
      ) : (
        <>
          <TransactionForm
            periodId={period.id}
            accounts={accounts.filter((a) => a.is_active)}
            categories={categories}
          />

          <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)]">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border bg-bg">
                  <th className="px-6 py-2 text-xs font-medium text-text-muted">
                    Description
                  </th>
                  <th className="px-6 py-2 text-xs font-medium text-text-muted">Category</th>
                  <th className="px-6 py-2 text-xs font-medium text-text-muted">Account</th>
                  <th className="px-6 py-2 text-xs font-medium text-text-muted">Tags</th>
                  <th className="px-6 py-2 text-xs font-medium text-text-muted">Date</th>
                  <th className="px-6 py-2 text-right text-xs font-medium text-text-muted">
                    Amount
                  </th>
                  <th className="px-6 py-2" />
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id} className="border-b border-border last:border-b-0">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-black/5 bg-bg text-xs font-semibold text-text-faint">
                          {initials(t.description)}
                        </span>
                        <span className="text-sm font-medium text-text">
                          {t.description}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-3 text-sm text-text-muted">
                      {t.category_id ? categoryById.get(t.category_id) : "—"}
                    </td>
                    <td className="px-6 py-3 text-sm text-text-muted">
                      {t.account_id ? accountById.get(t.account_id) : "—"}
                    </td>
                    <td className="px-6 py-3 text-sm text-text-muted">
                      {t.tags.length > 0 ? t.tags.join(", ") : "—"}
                    </td>
                    <td className="px-6 py-3 text-sm text-text-muted">{t.txn_date}</td>
                    <td
                      className={`tabular px-6 py-3 text-right text-sm font-medium ${
                        t.kind === "income" ? "text-success" : "text-text"
                      }`}
                    >
                      {t.kind === "income" ? "+" : "-"}
                      {formatMoney(t.amount)}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <form action={deleteTransaction.bind(null, t.id)}>
                        <button
                          type="submit"
                          className="text-xs text-text-faint hover:text-[#f04438]"
                        >
                          Delete
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
                {transactions.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-10 text-center text-sm text-text-muted">
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
