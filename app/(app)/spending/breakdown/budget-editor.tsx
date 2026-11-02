"use client";

import Link from "next/link";
import { Fragment, useEffect, useRef, useState } from "react";
import {
  copyBudgetForward,
  deleteBudgetLine,
  lockBudgetForPeriod,
  updateCategoryActive,
  updateCategorySettings,
  upsertBudgetLine,
} from "@/app/actions";
import { formatDate, formatMoney } from "@/lib/format";
import type { BudgetLockSnapshotEntry, Category, Period } from "@/lib/types";
import type { BudgetGridRow } from "@/lib/queries";
import { useToast } from "@/app/(app)/toast";
import { CategoryIconPicker } from "@/app/(app)/budgets/category-icon-picker";
import { BudgetGrid } from "@/app/(app)/budgets/budget-grid";
import { PencilIcon } from "./breakdown-panel";
import type { CategoryRow } from "./breakdown-panel";
import { NewCategoryDrawer } from "./new-category-drawer";
import { ToggleSwitch } from "@/app/(app)/toggle-switch";

// The monthly budget editor, and the one place budgets are managed (the old
// standalone Budget page folded in here). Income minus budget equals what's
// left to save; every active expense category is listed with a "+" to set
// an amount or the amount with a pencil to change it, grouped by group.
// Also: copy last month's budget, change a category's icon, deactivate or
// reactivate categories, and the full past-months planning grid.
export function BudgetEditor({
  periodId,
  periodName,
  periodStart,
  previousPeriod,
  income,
  rows,
  categories,
  gridRows,
  gridPeriods,
  budgetLockedAt,
  budgetLockedByEmail,
  budgetLockSnapshot,
}: {
  periodId: string;
  periodName: string;
  periodStart: string;
  previousPeriod: { id: string; name: string } | null;
  income: number;
  rows: CategoryRow[];
  categories: Category[];
  gridRows: BudgetGridRow[];
  // Oldest to newest, excluding the month being edited.
  gridPeriods: Period[];
  budgetLockedAt: string | null;
  budgetLockedByEmail: string | null;
  budgetLockSnapshot: BudgetLockSnapshotEntry[] | null;
}) {
  const [creating, setCreating] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [copying, setCopying] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [showDeactivated, setShowDeactivated] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [locking, setLocking] = useState(false);
  // The prop wins once the server has it (including an auto-lock from
  // another tab or the other person); the local value just covers the gap
  // between clicking Lock and the refresh landing.
  const [lockedLocally, setLockedLocally] = useState<string | null>(null);
  const locked = budgetLockedAt ?? lockedLocally;
  const lockedAutomatically = budgetLockedAt !== null && !budgetLockedByEmail;
  const showToast = useToast();

  const lockedPlannedByCategory = new Map(
    (budgetLockSnapshot ?? []).map((e) => [e.category_id, e.planned_amount]),
  );
  const autoLockDay = new Date(`${periodStart}T00:00:00Z`);
  autoLockDay.setUTCDate(autoLockDay.getUTCDate() + 3);

  async function lockNow() {
    setLocking(true);
    const result = await lockBudgetForPeriod(periodId);
    setLocking(false);
    if (!result.ok) {
      showToast(result.error ? `Couldn't save: ${result.error}` : "Couldn't lock the plan");
      return;
    }
    setLockedLocally(new Date().toISOString());
    showToast(`${periodName}'s planned amounts locked`);
  }

  const planned = (r: CategoryRow) => overrides[r.id] ?? r.planned;
  const activeRows = rows.filter((r) => r.isActive && !r.excludeFromBudget);
  const notBudgetedRows = rows.filter((r) => r.isActive && r.excludeFromBudget);
  const inactiveRows = rows.filter((r) => !r.isActive).sort((a, b) => a.name.localeCompare(b.name));
  const totalBudget = activeRows.reduce((s, r) => s + Math.max(0, planned(r)), 0);
  const savings = income - totalBudget;
  const savingsPct = income > 0 ? (savings / income) * 100 : 0;
  const lastMonthTotal = activeRows.reduce((s, r) => s + r.lastMonth, 0);

  // Grouped rows first (alphabetical by group), ungrouped after.
  const sorted = [...activeRows].sort(
    (a, b) =>
      Number(!a.group) - Number(!b.group) ||
      (a.group ?? "").localeCompare(b.group ?? "") ||
      a.name.localeCompare(b.name),
  );

  async function save(row: CategoryRow, amount: number) {
    if (amount === planned(row)) return;
    setOverrides((o) => ({ ...o, [row.id]: amount }));
    const options = { override: locked !== null };
    const result =
      amount > 0
        ? await upsertBudgetLine(row.id, periodId, amount, options)
        : await deleteBudgetLine(row.id, periodId, options);
    if (!result.ok) {
      setOverrides((o) => {
        const next = { ...o };
        delete next[row.id];
        return next;
      });
      showToast(result.error ? `Couldn't save: ${result.error}` : "Couldn't save budget");
    }
  }

  async function copyFromLastMonth() {
    if (!previousPeriod) return;
    setCopying(true);
    const result = await copyBudgetForward(previousPeriod.id, periodId);
    setCopying(false);
    if (!result.ok) {
      showToast(result.error ? `Couldn't copy: ${result.error}` : "Couldn't copy last month's budget");
      return;
    }
    showToast(
      result.copied
        ? `Copied ${result.copied} categor${result.copied === 1 ? "y" : "ies"} from ${previousPeriod.name}`
        : `${periodName} already matches ${previousPeriod.name}`,
    );
  }

  async function toggleActive(row: CategoryRow, isActive: boolean) {
    setTogglingId(row.id);
    const result = await updateCategoryActive(row.id, isActive);
    setTogglingId(null);
    if (!result.ok) {
      showToast(result.error ? `Couldn't save: ${result.error}` : "Couldn't save category");
      return;
    }
    showToast(isActive ? `${row.name} reactivated` : `${row.name} deactivated`);
  }

  return (
    <>
      <div className="card p-0 sm:p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
          <p className="text-section-label">Budget · {periodName}</p>
          <div className="flex items-center gap-2">
            {previousPeriod && !locked && (
              <button
                type="button"
                onClick={copyFromLastMonth}
                disabled={copying}
                className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-text transition-colors hover:bg-bg disabled:opacity-50"
              >
                {copying ? "Copying…" : `Copy from ${previousPeriod.name.split(" ")[0]}`}
              </button>
            )}
            {locked ? (
              <span className="flex items-center gap-1.5 rounded-lg bg-bg px-3 py-1.5 text-sm font-medium text-text-muted">
                <LockIcon />
                Locked
              </span>
            ) : (
              <button
                type="button"
                onClick={lockNow}
                disabled={locking}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-text transition-colors hover:bg-bg disabled:opacity-50"
              >
                <LockIcon />
                {locking ? "Locking…" : "Lock planned amounts"}
              </button>
            )}
            <Link
              href="/spending"
              className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-text transition-colors hover:bg-bg"
            >
              View breakdown
            </Link>
          </div>
        </div>

        <p className="border-b border-border bg-bg px-5 py-2 text-xs text-text-faint">
          {locked
            ? `Planned amounts locked ${formatDate(locked.slice(0, 10))}${
                lockedAutomatically ? " automatically" : budgetLockedByEmail ? ` by ${budgetLockedByEmail}` : ""
              }. To change one, click its amount and override it — the original stays on record.`
            : `Planned amounts lock automatically on ${formatDate(autoLockDay.toISOString().slice(0, 10))}, or lock them now once you're set.`}
        </p>

        <div className="grid grid-cols-1 gap-6 p-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
          {/* Income − budget = savings */}
          <div className="card-flush flex flex-col items-center justify-center gap-4 px-6 py-8 text-center lg:sticky lg:top-6">
            <Figure label="Income" value={income} muted />
            <Operator>−</Operator>
            <div className="w-full rounded-xl border border-border bg-bg px-6 py-5">
              <Figure label="Budget" value={totalBudget} />
            </div>
            <Operator>=</Operator>
            <div>
              <Figure label="Savings target" value={savings} muted signed />
              <p className="text-metadata mt-1">{savingsPct.toFixed(0)}% of income</p>
            </div>
          </div>

          {/* Category list */}
          <div className="card-flush">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <span className="size-1.5 rounded-full bg-text" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-text">Expenses</p>
                <p className="text-metadata">{formatMoney(lastMonthTotal)} last month</p>
              </div>
            </div>
            {sorted.length === 0 && (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-text-muted">No expense categories budgeted yet.</p>
                <p className="mt-1 text-xs text-text-faint">
                  Add your first one below — Rent, Groceries, whatever you actually spend on.
                </p>
              </div>
            )}
            <ul>
              {sorted.map((r, i) => {
                const showGroup = r.group && sorted[i - 1]?.group !== r.group;
                const firstUngrouped = !r.group && i > 0 && sorted[i - 1]?.group;
                return (
                  <Fragment key={r.id}>
                    {showGroup && <GroupLabel>{r.group}</GroupLabel>}
                    {firstUngrouped && <GroupLabel>Other</GroupLabel>}
                    <BudgetRow
                      row={r}
                      planned={planned(r)}
                      locked={locked !== null}
                      // Rollover money isn't in the snapshot, so compare the
                      // amount without it, or every rollover row would read
                      // as overridden.
                      plannedWithoutRollover={overrides[r.id] ?? r.planned - r.rolloverAmount}
                      lockedPlanned={lockedPlannedByCategory.get(r.id)}
                      busy={togglingId === r.id}
                      onSave={(amount) => save(r, amount)}
                      onDeactivate={() => toggleActive(r, false)}
                    />
                  </Fragment>
                );
              })}
              {notBudgetedRows.length > 0 && (
                <>
                  <GroupLabel>Not budgeted</GroupLabel>
                  {notBudgetedRows.map((r) => (
                    <li key={r.id} className="group flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
                      <CategoryIconPicker categoryId={r.id} categoryName={r.name} icon={r.icon} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-text">{r.name}</p>
                        <p className="text-metadata">Tracked, not planned</p>
                      </div>
                      <CategorySettingsMenu
                        row={r}
                        busy={togglingId === r.id}
                        onDeactivate={() => toggleActive(r, false)}
                      />
                      <span className="tabular shrink-0 px-2 text-sm text-text-muted">
                        {formatMoney(r.actual)} spent
                      </span>
                    </li>
                  ))}
                </>
              )}
            </ul>
            <div className="border-t border-border px-4 py-3">
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex items-center gap-1.5 text-sm font-medium text-text underline underline-offset-2 transition-colors hover:text-accent"
              >
                <span aria-hidden="true">+</span> Add custom category
              </button>
            </div>
          </div>
        </div>

        {(inactiveRows.length > 0 || gridPeriods.length > 0) && (
          <div className="space-y-4 border-t border-border px-5 py-4">
            {inactiveRows.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowDeactivated((v) => !v)}
                  className="text-xs font-medium text-text-faint transition-colors hover:text-accent"
                >
                  {showDeactivated
                    ? "Hide deactivated categories"
                    : `Show ${inactiveRows.length} deactivated categor${inactiveRows.length === 1 ? "y" : "ies"}`}
                </button>
                {showDeactivated && (
                  <ul className="card-flush animate-fade-in-up mt-3 max-w-lg divide-y divide-border">
                    {inactiveRows.map((r) => (
                      <li
                        key={r.id}
                        className={`flex items-center justify-between gap-3 px-4 py-3 transition-opacity ${
                          togglingId === r.id ? "opacity-40" : ""
                        }`}
                      >
                        <span className="flex items-center gap-2 text-sm text-text-muted">
                          <CategoryIconPicker categoryId={r.id} categoryName={r.name} icon={r.icon} />
                          {r.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleActive(r, true)}
                          disabled={togglingId === r.id}
                          className="text-xs font-medium text-accent hover:underline disabled:opacity-50"
                        >
                          Reactivate
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {gridPeriods.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowPast((v) => !v)}
                  className="text-xs font-medium text-text-faint transition-colors hover:text-accent"
                >
                  {showPast
                    ? "Hide past months"
                    : `Show past ${gridPeriods.length} month${gridPeriods.length === 1 ? "" : "s"}`}
                </button>
                {showPast && (
                  <div className="mt-3">
                    <BudgetGrid rows={gridRows.filter((r) => r.category.is_active)} periods={gridPeriods} />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {creating && <NewCategoryDrawer existing={categories} onClose={() => setCreating(false)} />}
    </>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <li className="text-section-label border-b border-border bg-bg px-4 py-1.5">{children}</li>
  );
}

function BudgetRow({
  row,
  planned,
  locked,
  plannedWithoutRollover,
  lockedPlanned,
  busy,
  onSave,
  onDeactivate,
}: {
  row: CategoryRow;
  planned: number;
  locked: boolean;
  plannedWithoutRollover: number;
  // The amount this category was locked at, if the period is locked and
  // this category had a budget line at the time — undefined either way.
  lockedPlanned?: number;
  busy: boolean;
  onSave: (amount: number) => void;
  onDeactivate: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState(planned > 0 ? String(planned) : "");

  function commit() {
    setEditing(false);
    onSave(Number(input || 0));
  }

  return (
    <li
      className={`group flex items-center gap-3 border-b border-border px-4 py-3 transition-opacity last:border-b-0 ${
        busy ? "opacity-40" : ""
      }`}
    >
      <CategoryIconPicker categoryId={row.id} categoryName={row.name} icon={row.icon} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-sm font-medium text-text">
          {row.name}
          {row.rollover && (
            <span
              title="Unspent budget rolls over to next month"
              aria-label="Rolls over"
              className="shrink-0 text-text-faint"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          )}
        </p>
        <p className="text-metadata">{formatMoney(row.lastMonth)} last month</p>
        {locked && Math.abs((lockedPlanned ?? 0) - plannedWithoutRollover) >= 0.005 && (
          <p className="text-metadata text-caution">
            Overridden ·{" "}
            {lockedPlanned ? `${formatMoney(lockedPlanned)} when locked` : "not planned when locked"}
          </p>
        )}
      </div>
      <CategorySettingsMenu row={row} busy={busy} onDeactivate={onDeactivate} />
      {editing ? (
        <label className="relative flex shrink-0 items-center gap-2">
          {locked && <span className="text-xs font-medium text-caution">Override</span>}
          <span className="relative w-28">
          <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-text-faint">$</span>
          <input
            autoFocus
            inputMode="decimal"
            value={input}
            onChange={(e) => setInput(e.target.value.replace(/[^\d.]/g, ""))}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                setInput(planned > 0 ? String(planned) : "");
                setEditing(false);
              }
            }}
            className="tabular w-full rounded-lg border border-border bg-bg py-1.5 pr-2 pl-6 text-right text-sm text-text outline-none focus:border-accent"
          />
          </span>
        </label>
      ) : planned > 0 ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={locked ? `Override planned amount for ${row.name}` : undefined}
          title={locked ? "Locked — click to override" : undefined}
          className="flex shrink-0 items-center gap-3 rounded-lg px-2 py-1 text-sm font-semibold text-text transition-colors hover:bg-bg"
        >
          <span className="tabular">{formatMoney(planned)}</span>
          <span className="text-text-muted">{locked ? <LockIcon /> : <PencilIcon />}</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={locked ? `Override planned amount for ${row.name}` : `Set budget for ${row.name}`}
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-bg hover:text-text"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
          </svg>
        </button>
      )}
    </li>
  );
}

// "⋯" popover replacing the old bare "Deactivate" hover link — same trigger
// spot, but now also holds the Needs and Roll over unspent toggles, which
// previously had no UI anywhere and could only be set by editing the
// database directly.
function CategorySettingsMenu({
  row,
  busy,
  onDeactivate,
}: {
  row: CategoryRow;
  busy: boolean;
  onDeactivate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [isNeed, setIsNeed] = useState(row.isNeed);
  const [rollover, setRollover] = useState(row.rollover);
  const [planInBudget, setPlanInBudget] = useState(!row.excludeFromBudget);
  const [saving, setSaving] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const showToast = useToast();

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  async function save(next: { is_need: boolean; rollover: boolean; plan_in_budget: boolean }) {
    const previous = { is_need: isNeed, rollover, plan_in_budget: planInBudget };
    setIsNeed(next.is_need);
    setRollover(next.rollover);
    setPlanInBudget(next.plan_in_budget);
    setSaving(true);
    const result = await updateCategorySettings(row.id, {
      is_need: next.is_need,
      rollover: next.rollover,
      ...(next.plan_in_budget !== previous.plan_in_budget ? { exclude_from_budget: !next.plan_in_budget } : {}),
    });
    setSaving(false);
    if (!result.ok) {
      setIsNeed(previous.is_need);
      setRollover(previous.rollover);
      setPlanInBudget(previous.plan_in_budget);
      showToast(result.error ? `Couldn't save: ${result.error}` : "Couldn't save category settings");
    }
  }

  return (
    <div ref={menuRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        aria-label={`${row.name} settings`}
        aria-expanded={open}
        className={`flex size-7 items-center justify-center rounded-lg text-text-faint transition-colors hover:bg-bg hover:text-text disabled:opacity-50 ${
          open ? "bg-bg text-text" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        }`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="animate-modal-panel absolute top-full right-0 z-20 mt-1 w-56 overflow-hidden rounded-xl border border-border bg-surface p-1.5 shadow-modal"
        >
          <label className="flex items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-sm text-text">
            Need (not a want)
            <ToggleSwitch
              checked={isNeed}
              onChange={(v) => save({ is_need: v, rollover, plan_in_budget: planInBudget })}
              disabled={saving}
              label="Need (not a want)"
            />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-sm text-text">
            Roll over unspent
            <ToggleSwitch
              checked={rollover}
              onChange={(v) => save({ is_need: isNeed, rollover: v, plan_in_budget: planInBudget })}
              disabled={saving}
              label="Roll over unspent"
            />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-sm text-text">
            Plan in budget
            <ToggleSwitch
              checked={planInBudget}
              onChange={(v) => save({ is_need: isNeed, rollover, plan_in_budget: v })}
              disabled={saving}
              label="Plan in budget"
            />
          </label>
          <div className="mt-1 border-t border-border pt-1">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onDeactivate();
              }}
              disabled={busy}
              className="block w-full rounded-lg px-2.5 py-2 text-left text-sm text-negative transition-colors hover:bg-bg disabled:opacity-50"
            >
              Deactivate
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth={2} />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}

function Figure({ label, value, muted, signed }: { label: string; value: number; muted?: boolean; signed?: boolean }) {
  return (
    <div>
      <p className={`text-sm ${muted ? "text-text-faint" : "font-medium text-text"}`}>{label}</p>
      <p className={`tabular text-balance-sm mt-1 ${muted ? "text-text-muted" : "text-text"} ${signed && value < 0 ? "text-negative" : ""}`}>
        {signed && value < 0 ? "-" : ""}
        {formatMoney(Math.abs(value))}
      </p>
    </div>
  );
}

function Operator({ children }: { children: React.ReactNode }) {
  return <span className="text-lg text-text-faint" aria-hidden="true">{children}</span>;
}
