import { getPeriods, pickPeriod } from "@/lib/periods";
import { getCategoryProgress, getCategories } from "@/lib/queries";
import { createCategory, upsertBudgetLine } from "@/app/actions";
import { formatMoney } from "@/lib/format";
import { PeriodSwitcher } from "@/app/(app)/period-switcher";

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
          <h1 className="text-lg font-semibold">Categories</h1>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            Planned amounts are set per period for expense categories.
          </p>
        </div>
        {period && <PeriodSwitcher periods={periods} selectedId={period.id} />}
      </div>

      <form
        action={createCategory}
        className="grid max-w-xl grid-cols-1 gap-4 rounded-xl border border-black/10 p-5 sm:grid-cols-3 dark:border-white/10"
      >
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Name</label>
          <input
            name="name"
            required
            placeholder="Groceries"
            className="w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/15"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Type</label>
          <select
            name="kind"
            className="w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/15"
          >
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>
        </div>
        <div className="flex items-end gap-2 pb-2.5">
          <input type="checkbox" id="is_need" name="is_need" className="h-4 w-4" />
          <label htmlFor="is_need" className="text-sm">Need (vs. want)</label>
        </div>
        <div className="sm:col-span-3">
          <button
            type="submit"
            className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
          >
            Add category
          </button>
        </div>
      </form>

      {!period ? (
        <p className="text-sm text-black/50 dark:text-white/50">
          Create a period first to set planned budget amounts.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-black/10 dark:border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-black/5 text-left dark:bg-white/5">
              <tr>
                <th className="px-4 py-2 font-medium">Expense category</th>
                <th className="px-4 py-2 font-medium">Need?</th>
                <th className="px-4 py-2 font-medium">Planned</th>
                <th className="px-4 py-2 font-medium">Actual</th>
                <th className="px-4 py-2 font-medium">Remaining</th>
              </tr>
            </thead>
            <tbody>
              {expenseProgress.map((c) => (
                <tr key={c.id} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-4 py-2">{c.name}</td>
                  <td className="px-4 py-2">{c.is_need ? "Need" : "Want"}</td>
                  <td className="px-4 py-2">
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
                        className="w-28 rounded-md border border-black/15 bg-transparent px-2 py-1 text-sm dark:border-white/15"
                      />
                      <button
                        type="submit"
                        className="rounded-md border border-black/15 px-2 py-1 text-xs dark:border-white/15"
                      >
                        Save
                      </button>
                    </form>
                  </td>
                  <td className="px-4 py-2">{formatMoney(c.actual)}</td>
                  <td
                    className={`px-4 py-2 font-medium ${
                      c.overBudget ? "text-red-600" : ""
                    }`}
                  >
                    {formatMoney(c.remaining)}
                  </td>
                </tr>
              ))}
              {expenseProgress.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-black/50 dark:text-white/50">
                    No expense categories yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div>
        <h2 className="text-sm font-medium text-black/70 dark:text-white/70">
          Income categories
        </h2>
        <ul className="mt-2 space-y-1 text-sm">
          {incomeCategories.map((c) => (
            <li key={c.id} className="text-black/70 dark:text-white/70">
              {c.name}
            </li>
          ))}
          {incomeCategories.length === 0 && (
            <li className="text-black/50 dark:text-white/50">None yet.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
