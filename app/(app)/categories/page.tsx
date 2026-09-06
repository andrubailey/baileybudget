import Link from "next/link";
import { getPeriods, pickPeriod } from "@/lib/periods";
import { getCategoryProgress, getCategories } from "@/lib/queries";
import {
  upsertBudgetLine,
  updateCategoryRollover,
  updateCategoryIcon,
  updateCategoryName,
  updateCategoryNeed,
} from "@/app/actions";
import { formatMoney } from "@/lib/format";
import { PeriodSwitcher } from "@/app/(app)/period-switcher";
import { AddCategoryForm } from "./add-category-form";
import { CopyBudgetButton } from "./copy-budget-button";
import { DeleteCategoryButton } from "./delete-category-button";
import { getCategoryIcon } from "@/lib/category-icons";

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
  const previousPeriod = period
    ? periods[periods.findIndex((p) => p.id === period.id) + 1]
    : undefined;

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

      <div className="flex flex-wrap gap-3">
        <AddCategoryForm />
        {period && previousPeriod && (
          <CopyBudgetButton
            fromPeriodId={previousPeriod.id}
            fromPeriodName={previousPeriod.name}
            toPeriodId={period.id}
          />
        )}
      </div>

      {!period ? (
        <p className="text-sm text-text-muted">
          Couldn&apos;t set up this month&apos;s period automatically — try
          reloading the page.
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
                <th className="px-6 py-2" />
              </tr>
            </thead>
            <tbody>
              {[...expenseProgress]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((c) => {
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
                        <form
                          action={async (formData: FormData) => {
                            "use server";
                            const icon = String(formData.get("icon") ?? "").trim() || null;
                            await updateCategoryIcon(c.id, icon);
                          }}
                        >
                          <input
                            name="icon"
                            defaultValue={c.icon ?? ""}
                            placeholder={getCategoryIcon(c.name)}
                            maxLength={4}
                            title="Override the auto-guessed icon — press Enter to save"
                            className="w-8 shrink-0 rounded-md border border-transparent bg-bg px-1 py-1 text-center text-sm outline-none focus:border-accent"
                          />
                        </form>
                        <form
                          action={async (formData: FormData) => {
                            "use server";
                            await updateCategoryName(c.id, String(formData.get("name") ?? ""));
                          }}
                        >
                          <input
                            name="name"
                            defaultValue={c.name}
                            title="Category name — press Enter to save"
                            className="w-32 rounded-md border border-transparent bg-transparent px-1 py-1 text-sm font-medium text-text outline-none focus:border-accent focus:bg-bg"
                          />
                        </form>
                        <form
                          action={async () => {
                            "use server";
                            await updateCategoryNeed(c.id, !c.is_need);
                          }}
                        >
                          <button
                            type="submit"
                            title={c.is_need ? "Marked a need — click to mark a want" : "Marked a want — click to mark a need"}
                            className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
                              c.is_need
                                ? "bg-accent-soft text-accent"
                                : "text-text-faint hover:bg-bg"
                            }`}
                          >
                            {c.is_need ? "Need" : "Want"}
                          </button>
                        </form>
                        <form
                          action={async () => {
                            "use server";
                            await updateCategoryRollover(c.id, !c.rollover);
                          }}
                        >
                          <button
                            type="submit"
                            title={c.rollover ? "Rollover on — click to disable" : "Rollover off — click to enable"}
                            className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
                              c.rollover
                                ? "bg-accent-soft text-accent"
                                : "text-text-faint hover:bg-bg"
                            }`}
                          >
                            ↻
                          </button>
                        </form>
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
                          <Link
                            key={t.id}
                            href={`/transactions?period=${period.id}&category=${c.id}`}
                            className="whitespace-nowrap rounded-md bg-bg px-2 py-1 text-xs font-medium text-text-muted hover:bg-accent-soft hover:text-accent"
                          >
                            {t.description}
                          </Link>
                        ))}
                        {extraCount > 0 && (
                          <Link
                            href={`/transactions?period=${period.id}&category=${c.id}`}
                            className="whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium text-text-faint hover:text-accent"
                          >
                            +{extraCount} more
                          </Link>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <DeleteCategoryButton id={c.id} name={c.name} />
                    </td>
                  </tr>
                );
              })}
              {expenseProgress.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-sm text-text-muted">
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
            <li key={c.id} className="flex items-center gap-2 text-text">
              <span>{getCategoryIcon(c.name, c.icon)}</span>
              <form
                action={async (formData: FormData) => {
                  "use server";
                  await updateCategoryName(c.id, String(formData.get("name") ?? ""));
                }}
              >
                <input
                  name="name"
                  defaultValue={c.name}
                  title="Category name — press Enter to save"
                  className="w-40 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm text-text outline-none focus:border-accent focus:bg-bg"
                />
              </form>
              <DeleteCategoryButton id={c.id} name={c.name} />
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
