"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  deleteTransaction,
  getHistoryForTransaction,
  restoreTransaction,
  toggleTransactionCleared,
  toggleTransactionPendingApproval,
  updateTransaction,
} from "@/app/actions";
import { formatMoney, formatDate } from "@/lib/format";
import type {
  Account,
  Category,
  Transaction,
  TransactionHistoryEntry,
} from "@/lib/types";
import type { SplitDetail } from "@/lib/queries";
import { SubmitButton } from "@/app/(app)/submit-button";
import { BankLogo } from "@/app/(app)/accounts/bank-logo";
import { getAvatarColors } from "@/lib/avatar-colors";
import { getAccountColor } from "@/lib/account-colors";
import { getCategoryColor } from "@/lib/category-colors";
import { getCategoryIcon } from "@/lib/category-icons";
import { EmptyState } from "@/app/(app)/empty-state";
import { COMPACT_FIELD_CLASS as fieldClass } from "@/lib/ui";

// The ✓ and action columns stay pinned first/last — reordering a checkbox
// away from the row's edge, or the row's action buttons into the middle,
// isn't a layout anyone actually wants. Everything between is drag-to-reorder
// and drag-to-resize.
const REORDERABLE_COLUMNS = [
  "description",
  "category",
  "account",
  "date",
  "by",
  "amount",
] as const;
type ColumnKey = (typeof REORDERABLE_COLUMNS)[number];
const COLUMN_LABELS: Record<ColumnKey, string> = {
  description: "Description",
  category: "Category",
  account: "Account",
  date: "Date",
  by: "By",
  amount: "Amount",
};
const DEFAULT_WIDTHS: Record<ColumnKey, number> = {
  description: 260,
  category: 160,
  account: 220,
  date: 110,
  by: 56,
  amount: 120,
};
const MIN_COLUMN_WIDTH = 48;
const COLUMN_ORDER_KEY = "transactions-table-column-order";
const COLUMN_WIDTHS_KEY = "transactions-table-column-widths";

function isColumnOrder(value: unknown): value is ColumnKey[] {
  return (
    Array.isArray(value) &&
    value.length === REORDERABLE_COLUMNS.length &&
    REORDERABLE_COLUMNS.every((c) => value.includes(c))
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
}

function creatorInitial(email: string | null) {
  if (!email) return null;
  return email.trim()[0]?.toUpperCase() ?? null;
}

// Turns a transaction_history snapshot row (recorded right before an edit)
// back into FormData shaped like what updateTransaction expects, so "undo"
// can just replay the same action instead of needing a separate code path.
function snapshotToFormData(snapshot: Record<string, unknown>): FormData {
  const fd = new FormData();
  fd.set("kind", String(snapshot.kind ?? "expense"));
  fd.set("description", String(snapshot.description ?? ""));
  fd.set("amount", String(snapshot.amount ?? "0"));
  fd.set("txn_date", String(snapshot.txn_date ?? ""));
  fd.set("account_id", snapshot.account_id ? String(snapshot.account_id) : "");
  fd.set(
    "category_id",
    snapshot.category_id ? String(snapshot.category_id) : "",
  );
  fd.set("notes", snapshot.notes ? String(snapshot.notes) : "");
  return fd;
}

export function TransactionsTable({
  transactions,
  accounts,
  categories,
  splitsByTransaction,
  initialCategoryFilter,
  initialAccountFilter,
  initialSearch,
  highlightId,
}: {
  transactions: Transaction[];
  accounts: Account[];
  categories: Category[];
  splitsByTransaction?: Map<string, SplitDetail[]>;
  initialCategoryFilter?: string;
  initialAccountFilter?: string;
  initialSearch?: string;
  // Set when arriving from a ⌘K search result — scrolls that specific
  // transaction into view and briefly flashes it, so "click a search result"
  // actually lands you ON the transaction instead of just the right period.
  highlightId?: string;
}) {
  const [search, setSearch] = useState(initialSearch ?? "");
  const [accountFilter, setAccountFilter] = useState(
    initialAccountFilter ?? "",
  );
  const [categoryFilter, setCategoryFilter] = useState(
    initialCategoryFilter ?? "",
  );
  // The sidebar's global search box (and any other deep link into this same
  // "all transactions" view) navigates by changing the URL's ?q=/?account=/
  // ?category= params rather than remounting this component, so the filter
  // state seeded above needs to re-sync whenever those params change —
  // otherwise typing a new search while already on this page updates the
  // URL but the visible results silently stay on the old filter.
  const [lastInitialSearch, setLastInitialSearch] = useState(initialSearch);
  const [lastInitialAccountFilter, setLastInitialAccountFilter] =
    useState(initialAccountFilter);
  const [lastInitialCategoryFilter, setLastInitialCategoryFilter] = useState(
    initialCategoryFilter,
  );
  if (initialSearch !== lastInitialSearch) {
    setLastInitialSearch(initialSearch);
    setSearch(initialSearch ?? "");
  }
  if (initialAccountFilter !== lastInitialAccountFilter) {
    setLastInitialAccountFilter(initialAccountFilter);
    setAccountFilter(initialAccountFilter ?? "");
  }
  if (initialCategoryFilter !== lastInitialCategoryFilter) {
    setLastInitialCategoryFilter(initialCategoryFilter);
    setCategoryFilter(initialCategoryFilter ?? "");
  }
  const [kindFilter, setKindFilter] = useState<
    "" | "income" | "expense" | "transfer"
  >("");
  // Briefly highlights a row when it first shows up in `transactions` (a new
  // transaction logged, an import, an undo) — otherwise it just appears
  // between renders with no visual acknowledgment that something landed.
  const [lastTransactions, setLastTransactions] = useState(transactions);
  // Seeded with highlightId so a ⌘K search result flashes on first render
  // too, not just on subsequent prop changes.
  const [newIds, setNewIds] = useState<Set<string>>(() =>
    highlightId ? new Set([highlightId]) : new Set(),
  );
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());
  useEffect(() => {
    if (!highlightId) return;
    rowRefs.current.get(highlightId)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightId]);
  if (transactions !== lastTransactions) {
    const prevIds = new Set(lastTransactions.map((t) => t.id));
    const freshIds = new Set(
      transactions.filter((t) => !prevIds.has(t.id)).map((t) => t.id),
    );
    setLastTransactions(transactions);
    if (freshIds.size > 0) setNewIds(freshIds);
  }
  const [editingId, setEditingId] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [historyEntries, setHistoryEntries] = useState<
    TransactionHistoryEntry[]
  >([]);
  const [undoRow, setUndoRow] = useState<{
    id: string;
    description: string;
  } | null>(null);
  const [editUndo, setEditUndo] = useState<{
    id: string;
    snapshot: Record<string, unknown>;
  } | null>(null);
  const [markingAllCleared, setMarkingAllCleared] = useState(false);
  // Optimistic overrides for the cleared toggle, keyed by transaction id.
  // Without this the checkbox/swipe just reflects the `transactions` prop,
  // which only catches up once the server action's revalidation round-trips
  // back — on mobile that round-trip lands after the swipe has already
  // snapped back, so the status visibly reverts before the real data arrives.
  const [clearedOverrides, setClearedOverrides] = useState<
    Record<string, boolean>
  >({});
  // Marks a row as fading out the instant delete is clicked — the row's
  // actual removal from `transactions` only lands once the server action's
  // revalidation round-trips back, which would otherwise mean the row just
  // sits there unchanged (no visual acknowledgment) until it abruptly
  // vanishes on the next render.
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  // Column order/widths persist per-browser (localStorage), same pattern as
  // the sidebar's collapsed state and the finances chat's width.
  const [columnOrder, setColumnOrder] = useState<ColumnKey[]>([
    ...REORDERABLE_COLUMNS,
  ]);
  const [columnWidths, setColumnWidths] =
    useState<Record<ColumnKey, number>>(DEFAULT_WIDTHS);
  const [draggedColumn, setDraggedColumn] = useState<ColumnKey | null>(null);
  const [resizingColumn, setResizingColumn] = useState<ColumnKey | null>(null);
  const resizeStart = useRef<{ x: number; width: number } | null>(null);

  useEffect(() => {
    try {
      const savedOrder = JSON.parse(
        localStorage.getItem(COLUMN_ORDER_KEY) ?? "null",
      );
      if (isColumnOrder(savedOrder)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing with localStorage, an external system, after mount
        setColumnOrder(savedOrder);
      }
    } catch {
      // ignore — localStorage unavailable or value corrupted
    }
    try {
      const savedWidths = JSON.parse(
        localStorage.getItem(COLUMN_WIDTHS_KEY) ?? "null",
      );
      if (savedWidths && typeof savedWidths === "object") {
        setColumnWidths((prev) => ({ ...prev, ...savedWidths }));
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!resizingColumn) return;

    function handleMove(e: MouseEvent) {
      if (!resizeStart.current || !resizingColumn) return;
      const delta = e.clientX - resizeStart.current.x;
      const next = Math.max(MIN_COLUMN_WIDTH, resizeStart.current.width + delta);
      setColumnWidths((prev) => ({ ...prev, [resizingColumn]: next }));
    }
    function handleUp() {
      setResizingColumn(null);
      resizeStart.current = null;
      setColumnWidths((current) => {
        try {
          localStorage.setItem(COLUMN_WIDTHS_KEY, JSON.stringify(current));
        } catch {
          // ignore
        }
        return current;
      });
    }

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [resizingColumn]);

  function startResize(column: ColumnKey, startX: number) {
    resizeStart.current = { x: startX, width: columnWidths[column] };
    setResizingColumn(column);
  }

  function handleColumnDrop(target: ColumnKey) {
    if (!draggedColumn || draggedColumn === target) {
      setDraggedColumn(null);
      return;
    }
    setColumnOrder((current) => {
      const next = current.filter((c) => c !== draggedColumn);
      const targetIndex = next.indexOf(target);
      next.splice(targetIndex, 0, draggedColumn);
      try {
        localStorage.setItem(COLUMN_ORDER_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
    setDraggedColumn(null);
  }

  const accountById = useMemo(
    () => new Map(accounts.map((a) => [a.id, a.name])),
    [accounts],
  );
  const accountBankById = useMemo(
    () => new Map(accounts.map((a) => [a.id, a.bank])),
    [accounts],
  );
  const accountColorById = useMemo(
    () =>
      new Map(
        accounts.map((a) => [a.id, getAccountColor(a.account_type, a.is_debt)]),
      ),
    [accounts],
  );
  const categoryById = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories],
  );

  const effectiveTransactions = useMemo(
    () =>
      transactions.map((t) =>
        t.id in clearedOverrides
          ? { ...t, cleared: clearedOverrides[t.id] }
          : t,
      ),
    [transactions, clearedOverrides],
  );

  const filtered = effectiveTransactions.filter((t) => {
    if (kindFilter && t.kind !== kindFilter) return false;
    if (
      accountFilter &&
      t.account_id !== accountFilter &&
      t.to_account_id !== accountFilter
    ) {
      return false;
    }
    if (categoryFilter && t.category_id !== categoryFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const haystack = [
        t.description,
        t.notes ?? "",
        t.category_id ? (categoryById.get(t.category_id) ?? "") : "",
        t.account_id ? (accountById.get(t.account_id) ?? "") : "",
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const filteredIncome = filtered
    .filter((t) => t.kind === "income")
    .reduce((sum, t) => sum + t.amount, 0);
  const filteredExpense = filtered
    .filter((t) => t.kind === "expense")
    .reduce((sum, t) => sum + t.amount, 0);
  const uncleared = filtered.filter((t) => !t.cleared);

  async function handleDelete(t: Transaction) {
    setDeletingIds((current) => new Set(current).add(t.id));
    await deleteTransaction(t.id);
    setUndoRow({ id: t.id, description: t.description });
    setTimeout(() => {
      setUndoRow((current) => (current?.id === t.id ? null : current));
    }, 8000);
  }

  async function handleUndo() {
    if (!undoRow) return;
    await restoreTransaction(undoRow.id);
    setDeletingIds((current) => {
      const next = new Set(current);
      next.delete(undoRow.id);
      return next;
    });
    setUndoRow(null);
  }

  // After an edit saves, transaction_history already has the pre-edit state
  // recorded (see updateTransaction) — grab it and offer to replay it back,
  // the same undo pattern as delete, instead of edits being final.
  async function handleEditSaved(id: string) {
    setEditingId(null);
    const entries = await getHistoryForTransaction(id);
    const previous = entries[0];
    if (!previous) return;
    setEditUndo({ id, snapshot: previous.snapshot });
    setTimeout(() => {
      setEditUndo((current) => (current?.id === id ? null : current));
    }, 8000);
  }

  async function handleUndoEdit() {
    if (!editUndo) return;
    await updateTransaction(editUndo.id, snapshotToFormData(editUndo.snapshot));
    setEditUndo(null);
  }

  async function handleToggleCleared(id: string, cleared: boolean) {
    setClearedOverrides((prev) => ({ ...prev, [id]: cleared }));
    try {
      await toggleTransactionCleared(id, cleared);
      // Safe to drop now — the revalidated `transactions` prop will already
      // agree, and dropping it avoids the override permanently masking a
      // future change to this row from elsewhere (e.g. the other person).
      setClearedOverrides((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch {
      setClearedOverrides((prev) => ({ ...prev, [id]: !cleared }));
    }
  }

  async function handleMarkAllCleared() {
    setMarkingAllCleared(true);
    try {
      await Promise.all(uncleared.map((t) => handleToggleCleared(t.id, true)));
    } finally {
      setMarkingAllCleared(false);
    }
  }

  async function toggleHistory(id: string) {
    if (historyId === id) {
      setHistoryId(null);
      return;
    }
    setHistoryId(id);
    const entries = await getHistoryForTransaction(id);
    setHistoryEntries(entries);
  }

  const exportHref = (() => {
    const params = new URLSearchParams();
    if (categoryFilter) params.set("category", categoryFilter);
    const qs = params.toString();
    return qs ? `/api/export?${qs}` : null;
  })();

  const KIND_TABS: { value: typeof kindFilter; label: string }[] = [
    { value: "", label: "All" },
    { value: "income", label: "Income" },
    { value: "expense", label: "Expenses" },
    { value: "transfer", label: "Transfers" },
  ];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg border border-border bg-surface p-1">
          {KIND_TABS.map((tab) => (
            <button
              key={tab.label}
              type="button"
              onClick={() => setKindFilter(tab.value)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                kindFilter === tab.value
                  ? "bg-accent-soft text-accent"
                  : "text-text-muted hover:bg-bg"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {(kindFilter === "" ||
          kindFilter === "income" ||
          kindFilter === "expense") && (
          <span className="tabular text-xs text-text-muted">
            {kindFilter !== "expense" && (
              <span className="text-success">
                +{formatMoney(filteredIncome)}
              </span>
            )}
            {kindFilter === "" && " · "}
            {kindFilter !== "income" && (
              <span>-{formatMoney(filteredExpense)}</span>
            )}
          </span>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search description, notes…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-xs rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-accent"
        />
        <select
          value={accountFilter}
          onChange={(e) => setAccountFilter(e.target.value)}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-accent"
        >
          <option value="">All accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-accent"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {(search || accountFilter || categoryFilter || kindFilter) && (
          <span className="text-xs text-text-faint">
            {filtered.length} of {transactions.length}
          </span>
        )}
        {uncleared.length > 0 && (
          <button
            type="button"
            onClick={handleMarkAllCleared}
            disabled={markingAllCleared}
            className="text-xs font-medium text-accent hover:underline disabled:opacity-50"
          >
            {markingAllCleared
              ? "Marking…"
              : `Mark ${uncleared.length} cleared`}
          </button>
        )}
        {exportHref && (
          <a
            href={exportHref}
            className="ml-auto text-xs font-medium text-accent underline underline-offset-2"
          >
            Export this filter
          </a>
        )}
      </div>

      {undoRow && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-accent-border bg-accent-soft px-4 py-2.5 text-sm">
          <span className="text-accent">
            Deleted &ldquo;{undoRow.description}&rdquo;.
          </span>
          <button
            type="button"
            onClick={handleUndo}
            className="font-semibold text-accent underline underline-offset-2 hover:text-accent-bright"
          >
            Undo
          </button>
        </div>
      )}

      {editUndo && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-accent-border bg-accent-soft px-4 py-2.5 text-sm">
          <span className="text-accent">Transaction edited.</span>
          <button
            type="button"
            onClick={handleUndoEdit}
            className="font-semibold text-accent underline underline-offset-2 hover:text-accent-bright"
          >
            Undo
          </button>
        </div>
      )}

      {/* Mobile: swipeable cards. Desktop: full table. A table row can't be
          reliably transform-animated for swipe gestures across browsers, so
          small screens get their own list instead of a squeezed table. */}
      <div className="space-y-2 sm:hidden">
        {filtered.map((t) => (
          <MobileTransactionCard
            key={t.id}
            transaction={t}
            accountName={
              t.account_id ? (accountById.get(t.account_id) ?? "—") : "—"
            }
            accountColor={
              t.account_id ? accountColorById.get(t.account_id) : undefined
            }
            categoryName={
              t.category_id ? (categoryById.get(t.category_id) ?? null) : null
            }
            onDelete={() => handleDelete(t)}
            onToggleCleared={(cleared) => handleToggleCleared(t.id, cleared)}
          />
        ))}
        {filtered.length === 0 && (
          <EmptyState
            message={
              transactions.length === 0
                ? "No transactions logged for this period yet."
                : "No transactions match your search/filters."
            }
          />
        )}
      </div>

      <div className="hidden overflow-x-auto rounded-xl border border-border bg-surface shadow-card sm:block">
        <table className="w-full text-left [table-layout:fixed]">
          <thead>
            <tr className="border-b border-border bg-bg">
              <th
                style={{ width: 40 }}
                className="sticky top-0 z-10 bg-bg px-4 py-2 text-xs font-medium text-text-muted"
              >
                ✓
              </th>
              {columnOrder.map((col) => (
                <th
                  key={col}
                  draggable
                  onDragStart={() => setDraggedColumn(col)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleColumnDrop(col)}
                  style={{ width: columnWidths[col] }}
                  className={`sticky top-0 z-10 cursor-grab bg-bg px-4 py-2 text-xs font-medium text-text-muted select-none active:cursor-grabbing ${
                    col === "amount" ? "text-right" : ""
                  } ${draggedColumn === col ? "opacity-40" : ""}`}
                  title="Drag to reorder"
                >
                  <span className="relative block">
                    {COLUMN_LABELS[col]}
                    <span
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        startResize(col, e.clientX);
                      }}
                      className="absolute inset-y-0 -right-4 z-20 w-2 cursor-col-resize touch-none hover:bg-accent-border active:bg-accent"
                    />
                  </span>
                </th>
              ))}
              <th style={{ width: 150 }} className="sticky top-0 z-10 bg-bg px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) =>
              editingId === t.id ? (
                <EditRow
                  key={t.id}
                  transaction={t}
                  accounts={accounts}
                  categories={categories}
                  onCancel={() => setEditingId(null)}
                  onSaved={() => handleEditSaved(t.id)}
                />
              ) : (
                <Fragment key={t.id}>
                  <tr
                    ref={(el) => {
                      if (el) rowRefs.current.set(t.id, el);
                      else rowRefs.current.delete(t.id);
                    }}
                    className={`border-b border-border transition-opacity duration-300 last:border-b-0 hover:bg-bg even:bg-bg/40 ${
                      deletingIds.has(t.id) ? "opacity-0" : "opacity-100"
                    } ${newIds.has(t.id) ? "animate-row-highlight" : ""}`}
                  >
                    <td className="px-4 py-3">
                      <label
                        className="flex cursor-pointer items-center justify-center py-1.5"
                        title={t.cleared ? "Cleared" : "Pending — mark cleared"}
                      >
                        <input
                          type="checkbox"
                          checked={t.cleared}
                          onChange={(e) =>
                            handleToggleCleared(t.id, e.target.checked)
                          }
                          aria-label={t.cleared ? "Cleared" : "Pending — mark cleared"}
                          className="h-4 w-4 accent-[var(--accent)]"
                        />
                      </label>
                    </td>
                    {columnOrder.map((col) => (
                      <td
                        key={col}
                        style={{ width: columnWidths[col] }}
                        className={
                          col === "amount"
                            ? `tabular px-4 py-3 text-right text-sm font-medium ${
                                t.kind === "income" ? "text-success" : "text-text"
                              }`
                            : "px-4 py-3 text-sm text-text-muted"
                        }
                      >
                        {col === "description" && (
                          <div className="flex items-center gap-3">
                            <span
                              className="flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                              style={{
                                backgroundColor: getAvatarColors(t.id).bg,
                                color: getAvatarColors(t.id).text,
                              }}
                            >
                              {initials(t.description)}
                            </span>
                            <div className="min-w-0">
                              <span className="flex items-center gap-1.5 truncate text-sm font-medium text-text">
                                <span className="truncate">{t.description}</span>
                                {t.recurring_transaction_id && (
                                  <span
                                    className="shrink-0 text-xs"
                                    title="Recurring"
                                  >
                                    🔁
                                  </span>
                                )}
                                {t.pending_approval && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      toggleTransactionPendingApproval(t.id, false)
                                    }
                                    title="Needs approval — click to approve"
                                    className="shrink-0 rounded-full bg-caution-bg px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap text-caution-strong hover:bg-caution-border"
                                  >
                                    Needs approval
                                  </button>
                                )}
                              </span>
                              {t.notes && (
                                <span className="block truncate text-xs text-text-faint">
                                  {t.notes}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                        {col === "category" &&
                          (t.category_id && categoryById.get(t.category_id) ? (
                            <span className="flex items-center gap-1.5">
                              <span
                                className="size-1.5 shrink-0 rounded-full"
                                style={{ backgroundColor: getCategoryColor(t.category_id) }}
                              />
                              <span>{getCategoryIcon(categoryById.get(t.category_id)!)}</span>
                              <span>{categoryById.get(t.category_id)}</span>
                            </span>
                          ) : splitsByTransaction?.has(t.id) ? (
                            <span
                              className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent"
                              title={splitsByTransaction
                                .get(t.id)!
                                .map(
                                  (s) =>
                                    `${s.category_id ? (categoryById.get(s.category_id) ?? "—") : "—"}: ${formatMoney(s.amount)}`,
                                )
                                .join(", ")}
                            >
                              Split ({splitsByTransaction.get(t.id)!.length})
                            </span>
                          ) : (
                            "—"
                          ))}
                        {col === "account" &&
                          (t.kind === "transfer" ? (
                            <div className="flex items-center gap-1.5">
                              {t.account_id && (
                                <span
                                  className="size-1.5 shrink-0 rounded-full"
                                  style={{
                                    backgroundColor: accountColorById.get(
                                      t.account_id,
                                    ),
                                  }}
                                />
                              )}
                              {t.account_id &&
                                accountBankById.get(t.account_id) && (
                                  <BankLogo
                                    bank={accountBankById.get(t.account_id)!}
                                    size="sm"
                                  />
                                )}
                              <span>
                                {t.account_id
                                  ? (accountById.get(t.account_id) ?? "—")
                                  : "—"}
                              </span>
                              <span>→</span>
                              {t.to_account_id && (
                                <span
                                  className="size-1.5 shrink-0 rounded-full"
                                  style={{
                                    backgroundColor: accountColorById.get(
                                      t.to_account_id,
                                    ),
                                  }}
                                />
                              )}
                              {t.to_account_id &&
                                accountBankById.get(t.to_account_id) && (
                                  <BankLogo
                                    bank={accountBankById.get(t.to_account_id)!}
                                    size="sm"
                                  />
                                )}
                              <span>
                                {t.to_account_id
                                  ? (accountById.get(t.to_account_id) ?? "—")
                                  : "—"}
                              </span>
                            </div>
                          ) : t.account_id ? (
                            <div className="flex items-center gap-1.5">
                              <span
                                className="size-1.5 shrink-0 rounded-full"
                                style={{
                                  backgroundColor: accountColorById.get(
                                    t.account_id,
                                  ),
                                }}
                              />
                              {accountBankById.get(t.account_id) && (
                                <BankLogo
                                  bank={accountBankById.get(t.account_id)!}
                                  size="sm"
                                />
                              )}
                              <span>{accountById.get(t.account_id)}</span>
                            </div>
                          ) : (
                            "—"
                          ))}
                        {col === "date" && formatDate(t.txn_date)}
                        {col === "by" &&
                          creatorInitial(t.created_by_email) && (
                            <span
                              title={t.created_by_email ?? undefined}
                              className="flex size-6 items-center justify-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent"
                            >
                              {creatorInitial(t.created_by_email)}
                            </span>
                          )}
                        {col === "amount" && (
                          <>
                            {t.kind === "income"
                              ? "+"
                              : t.kind === "expense"
                                ? "-"
                                : ""}
                            {formatMoney(t.amount)}
                          </>
                        )}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {t.kind !== "transfer" && (
                        <button
                          type="button"
                          onClick={() => setEditingId(t.id)}
                          className="mr-3 inline-block py-2 text-xs text-text-faint hover:text-accent"
                        >
                          Edit
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => toggleHistory(t.id)}
                        className="mr-3 inline-block py-2 text-xs text-text-faint hover:text-accent"
                      >
                        History
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(t)}
                        className="inline-block py-2 text-xs text-text-faint hover:text-negative"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                  {historyId === t.id && (
                    <tr className="border-b border-border bg-bg/40 last:border-b-0">
                      <td colSpan={8} className="px-4 py-3">
                        {historyEntries.length === 0 ? (
                          <p className="text-xs text-text-muted">
                            No edits recorded for this transaction yet.
                          </p>
                        ) : (
                          <ul className="space-y-1.5">
                            {historyEntries.map((h) => (
                              <li
                                key={h.id}
                                className="text-xs text-text-muted"
                              >
                                <span className="font-medium text-text">
                                  {h.edited_by_email ?? "Someone"}
                                </span>{" "}
                                edited this on{" "}
                                {formatDate(h.edited_at.slice(0, 10))} —
                                previously &ldquo;
                                {String(h.snapshot.description)}&rdquo; for{" "}
                                {formatMoney(Number(h.snapshot.amount))}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ),
            )}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-6 py-4">
                  <EmptyState
                    message={
                      transactions.length === 0
                        ? "No transactions logged for this period yet."
                        : "No transactions match your search/filters."
                    }
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Swipe left to reveal Delete, swipe right to reveal a Mark cleared toggle —
// mirrors common mobile mail/messaging apps instead of requiring a tap into
// a cramped inline edit form just to clear or remove a row.
function MobileTransactionCard({
  transaction: t,
  accountName,
  accountColor,
  categoryName,
  onDelete,
  onToggleCleared,
}: {
  transaction: Transaction;
  accountName: string;
  accountColor: string | undefined;
  categoryName: string | null;
  onDelete: () => void;
  onToggleCleared: (cleared: boolean) => void;
}) {
  const [dragX, setDragX] = useState(0);
  // Whether a touch is actively in progress — this affects the rendered
  // transition (no easing while dragging, snap-back easing once released),
  // so it has to be state rather than a ref: reading a ref's `.current`
  // during render isn't safe and can silently disagree with what actually
  // rendered on a given frame.
  const [isDragging, setIsDragging] = useState(false);
  const startX = useRef<number | null>(null);
  const SWIPE_THRESHOLD = 72;
  // Whether this drag has already buzzed for crossing the threshold — reset
  // per-gesture so it fires once as the swipe arms, not on every pixel past
  // it. Ref rather than state since it's read/written inside the same
  // touchmove handler and never needs to trigger a render.
  const armedBuzzed = useRef(false);

  // No-op where the Vibration API doesn't exist — notably iOS Safari, which
  // has never implemented it. Still worth calling on Android/Chrome.
  function buzz(pattern: number | number[]) {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(pattern);
    }
  }

  function handleTouchStart(e: React.TouchEvent) {
    startX.current = e.touches[0].clientX;
    armedBuzzed.current = false;
    setIsDragging(true);
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (startX.current === null) return;
    const delta = e.touches[0].clientX - startX.current;
    const next = Math.max(-120, Math.min(120, delta));
    if (!armedBuzzed.current && Math.abs(next) >= SWIPE_THRESHOLD) {
      armedBuzzed.current = true;
      buzz(10);
    } else if (armedBuzzed.current && Math.abs(next) < SWIPE_THRESHOLD) {
      armedBuzzed.current = false;
    }
    setDragX(next);
  }

  function handleTouchEnd() {
    setIsDragging(false);
    if (dragX <= -SWIPE_THRESHOLD) {
      buzz([10, 30, 10]);
      onDelete();
    } else if (dragX >= SWIPE_THRESHOLD) {
      buzz([10, 30, 10]);
      onToggleCleared(!t.cleared);
    }
    setDragX(0);
  }

  return (
    <div className="relative overflow-hidden rounded-xl">
      <div className="absolute inset-0 flex items-center justify-between px-4">
        <span className="text-xs font-semibold text-success">
          {t.cleared ? "Mark pending" : "Mark cleared"}
        </span>
        <span className="text-xs font-semibold text-negative">Delete</span>
      </div>
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: `translateX(${dragX}px)`,
          transition: isDragging ? "none" : "transform 150ms",
        }}
        className="relative flex items-center gap-3 rounded-xl border border-border bg-surface p-3.5 shadow-card"
      >
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
          style={{
            backgroundColor: getAvatarColors(t.id).bg,
            color: getAvatarColors(t.id).text,
          }}
        >
          {initials(t.description)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-sm font-medium text-text">
            <span className="truncate">{t.description}</span>
            {t.pending_approval && (
              <span className="shrink-0 rounded-full bg-caution-bg px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap text-caution-strong">
                Needs approval
              </span>
            )}
          </p>
          <p className="flex items-center gap-1.5 text-xs text-text-faint">
            {accountColor && (
              <span
                className="size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: accountColor }}
              />
            )}
            <span className="min-w-0 truncate">{accountName}</span>
            {categoryName && (
              <span className="shrink-0 whitespace-nowrap">
                · {getCategoryIcon(categoryName)} {categoryName}
              </span>
            )}
            <span className="shrink-0 whitespace-nowrap">
              · {formatDate(t.txn_date)}
            </span>
          </p>
        </div>
        <span
          className={`tabular shrink-0 text-sm font-medium ${
            t.kind === "income" ? "text-success" : "text-text"
          }`}
        >
          {t.kind === "income" ? "+" : t.kind === "expense" ? "-" : ""}
          {formatMoney(t.amount)}
        </span>
        {!t.cleared && (
          <span
            className="size-1.5 shrink-0 rounded-full bg-caution"
            title="Pending"
          />
        )}
      </div>
    </div>
  );
}

function EditRow({
  transaction: t,
  accounts,
  categories,
  onCancel,
  onSaved,
}: {
  transaction: Transaction;
  accounts: Account[];
  categories: Category[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [accountId, setAccountId] = useState(t.account_id ?? "");
  // Debt accounts store the opposite of what you'd expect (a charge is
  // "income", a payment is "expense"), so the initial display kind is
  // un-flipped from the stored value here and re-flipped back on submit.
  const initialIsDebtAccount =
    accounts.find((a) => a.id === t.account_id)?.is_debt ?? false;
  const [kind, setKind] = useState<"income" | "expense">(
    initialIsDebtAccount
      ? t.kind === "income"
        ? "expense"
        : "income"
      : t.kind === "income"
        ? "income"
        : "expense",
  );
  const isDebtAccount =
    accounts.find((a) => a.id === accountId)?.is_debt ?? false;
  const effectiveKind = isDebtAccount
    ? kind === "expense"
      ? "income"
      : "expense"
    : kind;
  const filteredCategories = categories.filter((c) => c.kind === kind);

  return (
    <tr className="border-b border-border bg-bg/40 last:border-b-0">
      <td colSpan={8} className="p-4">
        <form
          action={async (formData) => {
            formData.set("kind", effectiveKind);
            await updateTransaction(t.id, formData);
            onSaved();
          }}
          className="grid grid-cols-1 gap-3 sm:grid-cols-3"
        >
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as "income" | "expense")}
            className={fieldClass}
          >
            <option value="expense">
              {isDebtAccount ? "Charge" : "Expense"}
            </option>
            <option value="income">
              {isDebtAccount ? "Payment" : "Income"}
            </option>
          </select>
          <input
            name="description"
            required
            defaultValue={t.description}
            placeholder="Description"
            className={`${fieldClass} sm:col-span-2`}
          />
          <input
            type="number"
            step="0.01"
            name="amount"
            required
            defaultValue={t.amount}
            className={fieldClass}
          />
          <input
            type="date"
            name="txn_date"
            required
            defaultValue={t.txn_date}
            className={fieldClass}
          />
          <select
            name="account_id"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className={fieldClass}
          >
            <option value="">—</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <select
            name="category_id"
            defaultValue={t.category_id ?? ""}
            className={`${fieldClass} sm:col-span-2`}
          >
            <option value="">—</option>
            {filteredCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            name="notes"
            defaultValue={t.notes ?? ""}
            placeholder="Notes"
            maxLength={140}
            className={fieldClass}
          />
          <div className="flex gap-2 sm:col-span-3">
            <SubmitButton
              pendingText="Saving…"
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
            >
              Save
            </SubmitButton>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-text-muted hover:bg-bg"
            >
              Cancel
            </button>
          </div>
        </form>
      </td>
    </tr>
  );
}
