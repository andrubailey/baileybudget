"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatMoney } from "@/lib/format";
import { getCategoryColor } from "@/lib/category-colors";
import type { Account, Category } from "@/lib/types";
import { CategoryChip } from "@/app/(app)/category-chip";
import { EmptyState } from "@/app/(app)/empty-state";
import { CategoryDetailDrawer } from "./category-detail-drawer";
import { useContextMenu } from "@/app/(app)/context-menu";
import { categoryMenuItems, useCategoryQuickActions } from "@/app/(app)/category-menu";
import type { CategoryRow } from "../build-category-rows";

// Re-exported so existing `import type { CategoryRow } from "./breakdown-panel"`
// call sites (budget-editor.tsx) keep working — build-category-rows.ts is
// the canonical definition now, shared with the Budget page.
export type { CategoryRow };

export type IncomeRow = { id: string; name: string; icon: string | null; actual: number };

// Budget lives on its own subpage (/spending/budget), so it isn't a tab here.
type Tab = "expenses" | "income";
type SortKey = "actual" | "planned" | "available" | "pct";

// Number of tick marks in the Expenses tab's radial dial — dense enough to
// read as a smooth ring at a glance, coarse enough that each tick is still
// individually clickable.
const TICK_COUNT = 56;

export function BreakdownPanel({
  periodId,
  periodName,
  rows,
  incomeRows,
  totalIncome,
  accounts,
  categories,
}: {
  periodId: string;
  periodName: string;
  rows: CategoryRow[];
  incomeRows: IncomeRow[];
  totalIncome: number;
  accounts: Account[];
  categories: Category[];
}) {
  const [tab, setTab] = useState<Tab>("expenses");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "actual", dir: "desc" });
  const [openId, setOpenId] = useState<string | null>(null);

  // Right-click menu, shared with the Overview's Budget card. "Set budget"
  // opens the category panel, which edits the budget in place.
  const contextMenu = useContextMenu();
  const categoryActions = useCategoryQuickActions();
  function openMenu(e: React.MouseEvent, r: CategoryRow) {
    contextMenu.open(
      e,
      categoryMenuItems(r, {
        periodId,
        onOpen: () => setOpenId(r.id),
        onSetBudget: () => setOpenId(r.id),
        actions: categoryActions,
      }),
    );
  }

  const totalSpent = rows.reduce((s, r) => s + r.actual, 0);

  const spentRows = useMemo(() => rows.filter((r) => r.actual > 0), [rows]);

  function sortRows(list: CategoryRow[]) {
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const av = sortValue(a, sort.key);
      const bv = sortValue(b, sort.key);
      return (av - bv) * dir || a.name.localeCompare(b.name);
    });
  }
  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }));
  }

  // Which category owns each point around the ring, as a 0-1 fraction of
  // the circle — drives both the tick colors below and their click/hover
  // targets, so the dial stays a real (if chunky) breakdown and not just
  // decoration.
  const categoryFractions = useMemo(() => {
    const sorted = spentRows.slice().sort((a, b) => b.actual - a.actual);
    return sorted.reduce<{ id: string; name: string; start: number; end: number; color: string }[]>(
      (acc, r) => {
        const frac = totalSpent > 0 ? r.actual / totalSpent : 0;
        const start = acc.length > 0 ? acc[acc.length - 1].end : 0;
        acc.push({ id: r.id, name: r.name, start, end: start + frac, color: getCategoryColor(r.id) });
        return acc;
      },
      [],
    );
  }, [spentRows, totalSpent]);

  function categoryAt(frac: number) {
    return categoryFractions.find((c) => frac >= c.start && frac < c.end) ?? null;
  }

  const openRow = openId ? (rows.find((r) => r.id === openId) ?? null) : null;

  return (
    <>
      <div className="card-flush">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <p className="text-section-label">Category breakdown</p>
          <Link
            href="/spending/budget"
            aria-label="Edit budget"
            className="flex size-8 items-center justify-center rounded-lg border border-border text-text-muted transition-colors hover:bg-bg hover:text-text"
          >
            <PencilIcon />
          </Link>
        </div>

        <div role="tablist" className="grid grid-cols-2 border-b border-border">
          {(["expenses", "income"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`-mb-px border-b-2 py-3 text-sm font-medium capitalize transition-colors ${
                tab === t ? "border-text text-text" : "border-transparent text-text-muted hover:text-text"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* ---- Expenses ---- */}
        {tab === "expenses" && (
          <div className="px-5 py-6">
            <div className="relative mx-auto size-[240px]">
              <svg viewBox="0 0 200 200" className="size-full">
                {Array.from({ length: TICK_COUNT }).map((_, i) => {
                  const frac = (i + 0.5) / TICK_COUNT;
                  const owner = categoryAt(frac);
                  const angle = -90 + (i / TICK_COUNT) * 360;
                  return (
                    // The rotation has to live on this wrapping <g> rather
                    // than directly on the <line> — the animate-donut-slice
                    // class below sets a CSS `transform` (via its keyframe),
                    // and a CSS transform silently replaces an element's own
                    // `transform` attribute instead of combining with it, so
                    // a rotate on the animated element itself gets dropped.
                    <g key={i} transform={`rotate(${angle} 100 100)`}>
                      <line
                        x1="100"
                        y1="10"
                        x2="100"
                        y2="24"
                        stroke={owner?.color ?? "var(--neutral-track)"}
                        strokeWidth={5}
                        strokeLinecap="round"
                        className={`animate-donut-slice ${owner ? "cursor-pointer" : ""}`}
                        style={{ animationDelay: `${i * 6}ms` }}
                        onClick={owner ? () => setOpenId(owner.id) : undefined}
                      >
                        {owner && <title>{owner.name}</title>}
                      </line>
                    </g>
                  );
                })}
              </svg>
              {/* The ring's ticks only reach in to radius 76 (out of 100),
                  leaving a clear circle behind this — sized so even a
                  large total stays clear of the ticks instead of crowding
                  them, which is what "text-balance-display" (34px) did
                  here before. */}
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-center">
                <div className="flex size-9 items-center justify-center rounded-full bg-bg text-text-faint">
                  <WalletIcon />
                </div>
                <div>
                  <p className="text-sm text-text-muted">Spent this month</p>
                  <p className="tabular text-balance-sm text-text">{formatMoney(totalSpent)}</p>
                </div>
              </div>
            </div>

            {spentRows.length === 0 ? (
              <div className="mt-6">
                <EmptyState compact message={`No spending logged for ${periodName} yet.`} shortcut={{ keys: ["⌥", "E"], label: "to log an expense" }} />
              </div>
            ) : (
              <div className="mt-6 overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-border text-xs font-medium text-text-muted">
                      <th className="py-2 pr-3 font-medium">Category</th>
                      <SortHeader label="Amount spent" active={sort.key === "actual"} dir={sort.dir} onClick={() => toggleSort("actual")} />
                      <SortHeader label="% of expenses" active={sort.key === "pct"} dir={sort.dir} onClick={() => toggleSort("pct")} />
                      <th className="py-2 pl-3 text-right font-medium">vs last month</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortRows(spentRows).map((r) => {
                      const delta = r.lastMonth > 0 ? ((r.actual - r.lastMonth) / r.lastMonth) * 100 : null;
                      return (
                        <tr
                          key={r.id}
                          onClick={() => setOpenId(r.id)}
                          onContextMenu={(e) => openMenu(e, r)}
                          className="cursor-pointer border-b border-border transition-colors last:border-b-0 hover:bg-bg"
                        >
                          <td className="py-3 pr-3">
                            <CategoryChip id={r.id} name={r.name} icon={r.icon} />
                          </td>
                          <td className="tabular py-3 text-right text-sm font-medium text-text">{formatMoney(r.actual)}</td>
                          <td className="tabular py-3 text-right text-sm text-text-muted">
                            {totalSpent > 0 ? ((r.actual / totalSpent) * 100).toFixed(1) : "0.0"}%
                          </td>
                          <td className="tabular py-3 pl-3 text-right text-sm">
                            {delta === null ? (
                              <span className="text-text-faint">—</span>
                            ) : (
                              <span className={delta > 0 ? "text-negative" : "text-positive"}>
                                {delta > 0 ? "+" : ""}
                                {delta.toFixed(0)}%
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ---- Income ---- */}
        {tab === "income" && (
          <div className="px-5 py-6">
            <p className="text-center">
              <span className="tabular text-balance-display block text-text">{formatMoney(totalIncome)}</span>
              <span className="mt-1 block text-sm text-text-muted">Earned this month</span>
            </p>
            {incomeRows.length === 0 ? (
              <div className="mt-6">
                <EmptyState compact message={`No income logged for ${periodName} yet.`} shortcut={{ keys: ["⌥", "I"], label: "to log income" }} />
              </div>
            ) : (
              <ul className="mt-6 divide-y divide-border">
                {incomeRows.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 py-3">
                    <CategoryChip id={r.id} name={r.name} icon={r.icon} />
                    <span className="flex items-center gap-3">
                      <span className="tabular text-xs text-text-muted">
                        {totalIncome > 0 ? ((r.actual / totalIncome) * 100).toFixed(0) : 0}%
                      </span>
                      <span className="tabular text-sm font-medium text-positive">+{formatMoney(r.actual)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {contextMenu.menu}
      {openRow && (
        <CategoryDetailDrawer
          row={openRow}
          periodId={periodId}
          periodName={periodName}
          accounts={accounts}
          categories={categories}
          onClose={() => setOpenId(null)}
        />
      )}
    </>
  );
}

function sortValue(r: CategoryRow, key: SortKey) {
  switch (key) {
    case "actual":
      return r.actual;
    case "planned":
      return r.planned;
    case "available":
      return r.planned - r.actual;
    case "pct":
      return r.actual;
  }
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
  wide,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
  wide?: boolean;
}) {
  return (
    <th className={`py-2 font-medium ${wide ? "" : "text-right"}`}>
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 transition-colors hover:text-text ${active ? "text-text" : ""}`}
      >
        {label}
        <span aria-hidden="true" className="text-[10px]">
          {active ? (dir === "desc" ? "↓" : "↑") : "↕"}
        </span>
      </button>
    </th>
  );
}

function WalletIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 8a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v1h1.5A1.5 1.5 0 0 1 21 10.5v6a1.5 1.5 0 0 1-1.5 1.5H5a2 2 0 0 1-2-2V8Z M16 13h2"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z M13.5 6.5l3 3"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
