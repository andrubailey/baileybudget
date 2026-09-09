"use client";

import { Fragment, useState } from "react";
import { copyBudgetForward, quickCreateCategory, updateCategoryActive } from "@/app/actions";
import { CategoryIconPicker } from "./category-icon-picker";
import type { Period } from "@/lib/types";
import type { BudgetGridRow } from "@/lib/queries";
import { EmptyState } from "@/app/(app)/empty-state";
import { GridCell } from "./grid-cell";
import { BudgetGrid } from "./budget-grid";
import { FIELD_CLASS as fieldClass } from "@/lib/ui";
import { useToast } from "@/app/(app)/toast";

// The Budgets page used to open on a 12-month matrix — every category and
// every month at once, all the time, whether or not those past months still
// matter. This is the redesign: only the current month is in front view
// (the one that's actually still editable/relevant), adding a category
// lives right here instead of only on the Transactions page, and the full
// history is one click away instead of the default.
export function BudgetsView({
  rows,
  periods,
  currentPeriod,
}: {
  rows: BudgetGridRow[];
  // Oldest to newest, most recent 12 months.
  periods: Period[];
  currentPeriod: Period | null;
}) {
  const [showPast, setShowPast] = useState(false);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const [showDeactivated, setShowDeactivated] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const showToast = useToast();

  // Deactivated categories drop out of the default view (their history —
  // past transactions, past planned amounts — stays intact) rather than
  // being deleted; "Show N deactivated" reveals them for reactivating.
  const activeRows = rows.filter((r) => r.category.is_active);
  const deactivatedRows = rows.filter((r) => !r.category.is_active);
  const sorted = [...activeRows].sort(
    (a, b) =>
      (a.category.group_name ?? "").localeCompare(
        b.category.group_name ?? "",
      ) || a.category.name.localeCompare(b.category.name),
  );
  const pastPeriods = currentPeriod
    ? periods.filter((p) => p.id !== currentPeriod.id)
    : periods;
  // `periods` is oldest → newest, so the period right before the current
  // one in that array is last month — only defined once there's at least
  // one earlier period to copy from.
  const currentIndex = currentPeriod
    ? periods.findIndex((p) => p.id === currentPeriod.id)
    : -1;
  const lastMonthPeriod = currentIndex > 0 ? periods[currentIndex - 1] : null;

  async function handleAddCategory() {
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    const result = await quickCreateCategory(trimmed, "expense");
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Couldn't create category.");
      return;
    }
    setNewCategoryName("");
    setAddingCategory(false);
  }

  async function handleCopyFromLastMonth() {
    if (!lastMonthPeriod || !currentPeriod) return;
    setCopying(true);
    const result = await copyBudgetForward(lastMonthPeriod.id, currentPeriod.id);
    setCopying(false);
    if (!result.ok) {
      showToast(result.error ? `Couldn't copy: ${result.error}` : "Couldn't copy last month's budget");
      return;
    }
    showToast(
      result.copied
        ? `Copied ${result.copied} categor${result.copied === 1 ? "y" : "ies"} from ${lastMonthPeriod.name}`
        : `${currentPeriod.name} already matches ${lastMonthPeriod.name}`,
    );
  }

  async function handleToggleActive(categoryId: string, name: string, is_active: boolean) {
    setTogglingId(categoryId);
    const result = await updateCategoryActive(categoryId, is_active);
    setTogglingId(null);
    if (!result.ok) {
      showToast(result.error ? `Couldn't save: ${result.error}` : "Couldn't save category");
      return;
    }
    showToast(is_active ? `${name} reactivated` : `${name} deactivated`);
  }

  return (
    <div className="space-y-4">
      {addingCategory ? (
        <div className="animate-fade-in-up space-y-1.5">
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddCategory();
                }
                if (e.key === "Escape") {
                  setAddingCategory(false);
                  setNewCategoryName("");
                  setError(null);
                }
              }}
              placeholder="Category name"
              className={`max-w-xs ${fieldClass}`}
            />
            <button
              type="button"
              onClick={handleAddCategory}
              disabled={busy || !newCategoryName.trim()}
              className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Adding…" : "Add"}
            </button>
            <button
              type="button"
              onClick={() => {
                setAddingCategory(false);
                setNewCategoryName("");
                setError(null);
              }}
              className="shrink-0 rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-muted hover:bg-bg"
            >
              Cancel
            </button>
          </div>
          {error && <p className="text-xs text-negative">{error}</p>}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setAddingCategory(true)}
            className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-text-muted transition-colors hover:bg-bg"
          >
            + Add category
          </button>
          {lastMonthPeriod && (
            <button
              type="button"
              onClick={handleCopyFromLastMonth}
              disabled={copying}
              className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-text-muted transition-colors hover:bg-bg disabled:opacity-50"
            >
              {copying ? "Copying…" : `Copy budget from ${lastMonthPeriod.name}`}
            </button>
          )}
        </div>
      )}

      {!currentPeriod || sorted.length === 0 ? (
        <EmptyState message="No expense categories yet." />
      ) : (
        <>
          {/* Mobile: stacked cards — the 3-column table gets too cramped
              (icon + name sharing space with a number input and an action)
              below sm, so name/amount/action each get their own row. */}
          <div className="space-y-3 sm:hidden">
            {sorted.map((row, i) => {
              const showGroupHeader =
                row.category.group_name &&
                sorted[i - 1]?.category.group_name !== row.category.group_name;
              return (
                <div key={row.category.id}>
                  {showGroupHeader && (
                    <p className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-text-faint">
                      {row.category.group_name}
                    </p>
                  )}
                  <div
                    style={{ animationDelay: `${i * 35}ms` }}
                    className={`animate-fade-in-up flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3 shadow-card transition-opacity duration-150 ${
                      togglingId === row.category.id ? "opacity-40" : ""
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <CategoryIconPicker
                        categoryId={row.category.id}
                        categoryName={row.category.name}
                        icon={row.category.icon}
                      />
                      <span className="truncate text-sm font-medium text-text">
                        {row.category.name}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <GridCell
                        categoryId={row.category.id}
                        periodId={currentPeriod.id}
                        initialValue={row.plannedByPeriod.get(currentPeriod.id) ?? 0}
                        bare
                      />
                      <button
                        type="button"
                        onClick={() =>
                          handleToggleActive(row.category.id, row.category.name, false)
                        }
                        disabled={togglingId === row.category.id}
                        className="text-text-faint transition-colors hover:text-negative disabled:opacity-50"
                        aria-label={`Deactivate ${row.category.name}`}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          className="h-4 w-4"
                        >
                          <path
                            fillRule="evenodd"
                            d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.5h-2.25a.75.75 0 0 0 0 1.5h.3l.815 10.598A2.75 2.75 0 0 0 7.607 19h4.786a2.75 2.75 0 0 0 2.742-2.652L15.95 5.75h.3a.75.75 0 0 0 0-1.5H14v-.5A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4.25c.966 0 1.897.166 2.75.47v-.97c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.97A9.75 9.75 0 0 1 10 4.25Z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="animate-fade-in-up hidden max-w-lg overflow-hidden rounded-xl border border-border bg-surface shadow-card sm:block">
            <table className="w-full table-fixed text-left">
              <thead>
                <tr className="border-b border-border bg-bg">
                  <th className="px-6 py-2 text-xs font-medium text-text-muted">
                    Category
                  </th>
                  <th className="w-32 px-4 py-2 text-xs font-medium whitespace-nowrap text-text-muted">
                    {currentPeriod.name}
                  </th>
                  <th className="w-24 px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((row, i) => {
                  const showGroupHeader =
                    row.category.group_name &&
                    sorted[i - 1]?.category.group_name !== row.category.group_name;
                  return (
                    <Fragment key={row.category.id}>
                      {showGroupHeader && (
                        <tr>
                          <td
                            colSpan={3}
                            className="bg-bg px-6 py-1.5 text-xs font-semibold uppercase tracking-wide text-text-faint"
                          >
                            {row.category.group_name}
                          </td>
                        </tr>
                      )}
                      <tr
                        className={`border-b border-border transition-[opacity,background-color] duration-150 last:border-b-0 hover:bg-bg ${
                          togglingId === row.category.id ? "opacity-40" : ""
                        }`}
                      >
                        <td className="px-6 py-2">
                          <div className="flex items-center gap-2 text-sm font-medium text-text">
                            <CategoryIconPicker
                              categoryId={row.category.id}
                              categoryName={row.category.name}
                              icon={row.category.icon}
                            />
                            {row.category.name}
                          </div>
                        </td>
                        <GridCell
                          categoryId={row.category.id}
                          periodId={currentPeriod.id}
                          initialValue={row.plannedByPeriod.get(currentPeriod.id) ?? 0}
                        />
                        <td className="px-4 py-2 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              handleToggleActive(row.category.id, row.category.name, false)
                            }
                            disabled={togglingId === row.category.id}
                            className="text-xs text-text-faint transition-colors hover:text-negative disabled:opacity-50"
                          >
                            Deactivate
                          </button>
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {deactivatedRows.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowDeactivated((v) => !v)}
            className="text-xs font-medium text-text-faint transition-colors hover:text-accent"
          >
            {showDeactivated
              ? "Hide deactivated categories"
              : `Show ${deactivatedRows.length} deactivated categor${deactivatedRows.length === 1 ? "y" : "ies"}`}
          </button>
          {showDeactivated && (
            <div className="animate-fade-in-up mt-3 max-w-lg divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
              {deactivatedRows
                .sort((a, b) => a.category.name.localeCompare(b.category.name))
                .map((row, i) => (
                  <div
                    key={row.category.id}
                    style={{ animationDelay: `${i * 35}ms` }}
                    className={`animate-fade-in-up flex items-center justify-between gap-3 px-4 py-2 transition-opacity duration-150 ${
                      togglingId === row.category.id ? "opacity-40" : ""
                    }`}
                  >
                    <span className="flex items-center gap-2 text-sm text-text-muted">
                      <CategoryIconPicker
                        categoryId={row.category.id}
                        categoryName={row.category.name}
                        icon={row.category.icon}
                      />
                      {row.category.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleToggleActive(row.category.id, row.category.name, true)}
                      disabled={togglingId === row.category.id}
                      className="text-xs font-medium text-accent hover:underline disabled:opacity-50"
                    >
                      Reactivate
                    </button>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {pastPeriods.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowPast((v) => !v)}
            className="text-xs font-medium text-text-faint transition-colors hover:text-accent"
          >
            {showPast
              ? "Hide past months"
              : `Show past ${pastPeriods.length} month${pastPeriods.length === 1 ? "" : "s"}`}
          </button>
          {showPast && (
            <div className="animate-fade-in-up mt-3">
              <BudgetGrid rows={rows} periods={pastPeriods} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
