import { getPeriods, pickPeriod } from "@/lib/periods";
import { getCategoryProgress, getCategories } from "@/lib/queries";
import { createCategory, upsertBudgetLine } from "@/app/actions";
import { formatMoney } from "@/lib/format";
import { PeriodSwitcher } from "@/app/(app)/period-switcher";

const CATEGORY_COLORS = [
  "#9e77ed",
  "#f04438",
  "#0ba5ec",
  "#17b26a",
  "#4e5ba6",
  "#f79009",
];

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period: requestedPeriod } = await searchParams;
  const periods = await getPeriods();
  const period = pickPeriod(periods, requestedPeriod);

  const [categories, expenseProgress] = await Promise.all([
    getCategories(),
    period ? getCategoryProgress(period.id) : Promise.resolve([]),
  ]);

  const incomeCategories = categories.filter((c) => c.kind === "income");

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-text">Categories</h1>
          <p className="mt-1 text-sm text-text-muted">
            Planned amounts are set per period for expense categories.
          </p>
        </div>
        {period && <PeriodSwitcher periods={periods} selectedId={period.id} />}
      </div>

      <form
        action={createCategory}
        className="grid max-w-xl grid-cols-1 gap-4 rounded-xl border border-border bg-surface p-6 shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] sm:grid-cols-3"
      >
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-text">Name</label>
          <input
            name="name"
            required
            placeholder="Groceries"
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition-colors focus:border-accent"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-text">Type</label>
          <select
            name="kind"
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition-colors focus:border-accent"
          >
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>
        </div>
        <div className="flex items-end gap-2 pb-2.5">
          <input type="checkbox" id="is_need" name="is_need" className="h-4 w-4 accent-[var(--accent)]" />
          <label htmlFor="is_need" className="text-sm text-text">Need (vs. want)</label>
        </div>
        <div className="sm:col-span-3">
          <button
            type="submit"
            className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Add category
          </button>
        </div>
      </form>

      {!period ? (
        <p className="text-sm text-text-muted">
          Create a period first to set planned budget amounts.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)]">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border bg-bg">
                <th className="px-6 py-2 text-xs font-medium text-text-muted">Name</th>
                <th className="px-6 py-2 text-xs font-medium text-text-muted">Planned</th>
                <th className="px-6 py-2 text-xs font-medium text-text-muted">Actual</th>
                <th className="px-6 py-2 text-xs font-medium text-text-muted">Rem</th>
                <th className="px-6 py-2 text-xs font-medium text-text-muted">Transactions</th>
              </tr>
            </thead>
            <tbody>
              {expenseProgress.map((c, i) => {
                const remColor =
                  c.remaining > 0
                    ? "text-success"
                    : c.remaining < 0
                      ? "text-[#f04438]"
                      : "text-text";
                const shownTxns = c.transactions.slice(0, 4);
                const extraCount = c.transactions.length - shownTxns.length;
                return (
                  <tr key={c.id} className="border-b border-border last:border-b-0">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="flex size-6 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold text-white"
                          style={{ backgroundColor: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }}
                        >
                          {c.name.slice(0, 1).toUpperCase()}
                        </span>
                        <span className="text-sm font-medium text-text">{c.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <form
                        action={async (formData: FormData) => {
                          "use server";
                          const amount = Number(formData.get("planned_amount") ?? 0);
                          await upsertBudgetLine(c.id, period.id, amount);
                        }}
                        className="flex items-center gap-2"
                      >
                        <input
                          type="number"
                          step="0.01"
                          name="planned_amount"
                          defaultValue={c.planned}
                          className="w-24 rounded-md border border-border bg-bg px-2 py-1 text-sm tabular text-text outline-none focus:border-accent"
                        />
                        <button
                          type="submit"
                          className="rounded-md border border-border px-2 py-1 text-xs font-medium text-text-muted hover:bg-bg"
                        >
                          Save
                        </button>
                      </form>
                    </td>
                    <td className="tabular px-6 py-3 text-sm text-text">
                      {formatMoney(c.actual)}
                    </td>
                    <td className={`tabular px-6 py-3 text-sm font-medium ${remColor}`}>
                      {formatMoney(c.remaining)}
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {shownTxns.map((t) => (
                          <span
                            key={t.id}
                            className="whitespace-nowrap rounded-md bg-bg px-2 py-1 text-xs font-medium text-text-muted"
                          >
                            {t.description}
                          </span>
                        ))}
                        {extraCount > 0 && (
                          <span className="whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium text-text-faint">
                            +{extraCount} more
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {expenseProgress.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-sm text-text-muted">
                    No expense categories yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div>
        <h2 className="text-sm font-medium text-text-muted">Income categories</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {incomeCategories.map((c) => (
            <li key={c.id} className="text-text">
              {c.name}
            </li>
          ))}
          {incomeCategories.length === 0 && (
            <li className="text-text-muted">None yet.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
