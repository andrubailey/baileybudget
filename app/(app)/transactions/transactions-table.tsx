"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  bulkDeleteTransactions,
  bulkUpdateTransactions,
  deleteTransaction,
  restoreTransaction,
  toggleTransactionPendingApproval,
} from "@/app/actions";
import { formatMoney, formatDate } from "@/lib/format";
import type { Account, Category, Period, Transaction } from "@/lib/types";
import type { SplitDetail } from "@/lib/queries";
import { BankLogo } from "@/app/(app)/accounts/bank-logo";
import { presentTransaction, toAccountLookup } from "@/lib/transaction-presentation";
import { EmptyState } from "@/app/(app)/empty-state";
import { useToast } from "@/app/(app)/toast";
import { PeriodSwitcher } from "@/app/(app)/period-switcher";
import { TransactionDetailModal } from "@/app/(app)/transaction-detail-modal";
import { CategoryChip } from "@/app/(app)/category-chip";
import { isPendingTransaction, usePendingTransactions } from "@/app/(app)/pending-transactions";
import {
  RowFlags,
  TransactionAmount,
  TransactionAvatar,
  TransactionRow,
} from "@/app/(app)/transaction-row";

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
  "notes",
] as const;
type ColumnKey = (typeof REORDERABLE_COLUMNS)[number];
const COLUMN_LABELS: Record<ColumnKey, string> = {
  description: "Description",
  category: "Category",
  account: "Account",
  date: "Date",
  by: "By",
  amount: "Amount",
  notes: "Notes",
};
const DEFAULT_WIDTHS: Record<ColumnKey, number> = {
  description: 260,
  category: 160,
  account: 220,
  date: 110,
  by: 56,
  amount: 120,
  notes: 180,
};
// Columns whose values can't be meaningfully sorted/compared (drag handles,
// selection, etc. aren't in this list at all — this is just for excluding
// "Notes" from the sortable set, since free text has no natural order).
const SORTABLE_COLUMNS = new Set<ColumnKey>([
  "description",
  "category",
  "account",
  "date",
  "by",
  "amount",
]);
// Column-header filter icon only shows up for Category and Amount — search
// and the top filter bar already cover description/account, and per-column
// filtering the rest just added clutter nobody used.
const FILTERABLE_COLUMNS = new Set<ColumnKey>(["category", "amount"]);
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

function creatorInitial(email: string | null) {
  if (!email) return null;
  return email.trim()[0]?.toUpperCase() ?? null;
}

export function TransactionsTable({
  transactions,
  accounts,
  categories,
  splitsByTransaction,
  initialCategoryFilter,
  initialAccountFilter,
  initialSearch,
  initialFlag,
  highlightId,
  periods,
  selectedPeriodId,
}: {
  transactions: Transaction[];
  accounts: Account[];
  categories: Category[];
  splitsByTransaction?: Map<string, SplitDetail[]>;
  initialCategoryFilter?: string;
  initialAccountFilter?: string;
  initialSearch?: string;
  // Deep link from the dashboard's attention strip — "show me just the
  // rows waiting for approval" / "just the uncategorized ones".
  initialFlag?: "pending" | "uncategorized";
  // Set when arriving from a ⌘K search result — scrolls that specific
  // transaction into view and briefly flashes it, so "click a search result"
  // actually lands you ON the transaction instead of just the right period.
  highlightId?: string;
  // Rendered as a month picker in the same row as the All/Income/Expenses/
  // Transfers tabs — both are "which transactions am I looking at" filters,
  // so they read as one control group instead of one living down by the form.
  periods: Period[];
  selectedPeriodId: string;
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
  const [flagFilter, setFlagFilter] = useState<"" | "pending" | "uncategorized">(
    initialFlag ?? "",
  );
  const [lastInitialFlag, setLastInitialFlag] = useState(initialFlag);
  if (initialFlag !== lastInitialFlag) {
    setLastInitialFlag(initialFlag);
    setFlagFilter(initialFlag ?? "");
  }
  const [kindFilter, setKindFilter] = useState<
    "" | "income" | "expense" | "transfer"
  >("");
  // Sliding highlight behind the active All/Income/Expenses/Transfers tab —
  // measured off the actual button elements (same technique as the sidebar's
  // active-link pill) so it stays correct regardless of label width.
  const kindTabRefs = useRef(new Map<string, HTMLButtonElement>());
  const [kindTabPill, setKindTabPill] = useState<{ left: number; width: number } | null>(null);
  useEffect(() => {
    const el = kindTabRefs.current.get(kindFilter);
    setKindTabPill(el ? { left: el.offsetLeft, width: el.offsetWidth } : null);
  }, [kindFilter]);
  // Per-column filters, set from a popover opened by clicking the filter
  // icon next to that column's name in the header — only Category and
  // Amount get one (see FILTERABLE_COLUMNS above); the header itself also
  // has a search box and account picker that filter description/account.
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");
  // Which column's filter popover is open, if any — only one at a time.
  const [openFilterCol, setOpenFilterCol] = useState<ColumnKey | null>(null);

  function columnHasFilter(col: ColumnKey): boolean {
    switch (col) {
      case "category":
        return categoryFilter !== "";
      case "amount":
        return amountMin !== "" || amountMax !== "";
      default:
        return false;
    }
  }

  function clearColumnFilter(col: ColumnKey) {
    switch (col) {
      case "category":
        setCategoryFilter("");
        break;
      case "amount":
        setAmountMin("");
        setAmountMax("");
        break;
    }
  }
  // Click a sortable column header to sort by it — asc, then desc, then
  // back to the table's natural (server-provided, newest-first) order.
  const [sortColumn, setSortColumn] = useState<ColumnKey | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  function handleSortClick(col: ColumnKey) {
    if (!SORTABLE_COLUMNS.has(col)) return;
    if (sortColumn !== col) {
      setSortColumn(col);
      setSortDirection("asc");
    } else if (sortDirection === "asc") {
      setSortDirection("desc");
    } else {
      setSortColumn(null);
    }
  }
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
  // Which transaction's detail modal is open. Closing plays the modal's exit
  // animation before actually unmounting — set detailClosing, wait for the
  // animation to finish, then clear editingId — instead of just vanishing.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detailClosing, setDetailClosing] = useState(false);

  function openDetail(id: string) {
    setEditingId(id);
  }
  function closeDetail() {
    setDetailClosing(true);
    setTimeout(() => {
      setEditingId(null);
      setDetailClosing(false);
    }, 150);
  }

  // Row-selection for the bulk action bar (delete / change account / change
  // date / change category across everything checked at once).
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkDate, setBulkDate] = useState("");
  const showToast = useToast();
  const [undoRow, setUndoRow] = useState<{
    id: string;
    description: string;
  } | null>(null);
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
  const accountsById = useMemo(() => toAccountLookup(accounts), [accounts]);
  const categoryById = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories],
  );
  const categoryRecordById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  const effectiveTransactions = usePendingTransactions(transactions);

  // Every distinct person who's logged a transaction in this list — backs
  // the detail modal's "Created by" dropdown so reassigning attribution
  // means picking from who's actually used this household's data, not
  // typing an email by hand.
  const knownCreators = useMemo(() => {
    const byEmail = new Map<string, { id: string | null; email: string }>();
    for (const t of transactions) {
      if (t.created_by_email) {
        byEmail.set(t.created_by_email, { id: t.created_by, email: t.created_by_email });
      }
    }
    return Array.from(byEmail.values());
  }, [transactions]);

  // Was a plain `.filter()` in the render body — a new array on every
  // render regardless of whether any of these actually changed, which also
  // silently defeated `sortedFiltered`'s own memoization below (its deps
  // include this array, so a fresh reference every render meant it recomputed
  // every time too). Between them, the full list was being filtered *and*
  // sorted on every re-render of this component — a checkbox toggle, a
  // hover, opening the detail modal — not just when data or filters changed.
  const filtered = useMemo(
    () =>
      effectiveTransactions.filter((t) => {
        if (kindFilter && t.kind !== kindFilter) return false;
        if (flagFilter === "pending" && !t.pending_approval) return false;
        if (
          flagFilter === "uncategorized" &&
          (t.kind === "transfer" || t.category_id !== null || splitsByTransaction?.has(t.id))
        ) {
          return false;
        }
        if (
          accountFilter &&
          t.account_id !== accountFilter &&
          t.to_account_id !== accountFilter
        ) {
          return false;
        }
        if (categoryFilter && t.category_id !== categoryFilter) return false;
        if (amountMin && t.amount < Number(amountMin)) return false;
        if (amountMax && t.amount > Number(amountMax)) return false;
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
      }),
    [
      effectiveTransactions,
      kindFilter,
      flagFilter,
      splitsByTransaction,
      accountFilter,
      categoryFilter,
      amountMin,
      amountMax,
      search,
      categoryById,
      accountById,
    ],
  );

  function sortValue(t: Transaction, col: ColumnKey): string | number {
    switch (col) {
      case "description":
        return t.description.toLowerCase();
      case "category":
        return t.category_id ? (categoryById.get(t.category_id) ?? "").toLowerCase() : "";
      case "account":
        return t.account_id ? (accountById.get(t.account_id) ?? "").toLowerCase() : "";
      case "date":
        return t.txn_date;
      case "by":
        return (t.created_by_email ?? "").toLowerCase();
      case "amount":
        return t.amount;
      default:
        return "";
    }
  }

  const sortedFiltered = useMemo(() => {
    if (!sortColumn) return filtered;
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = sortValue(a, sortColumn);
      const bv = sortValue(b, sortColumn);
      if (av < bv) return sortDirection === "asc" ? -1 : 1;
      if (av > bv) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
    return copy;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sortValue closes over accountById/categoryById, which are already deps of `filtered` upstream; re-listing them here would just re-sort on every render for no behavior change
  }, [filtered, sortColumn, sortDirection]);

  async function handleDelete(t: Transaction) {
    setDeletingIds((current) => new Set(current).add(t.id));
    await deleteTransaction(t.id);
    showToast("Transaction deleted");
    setUndoRow({ id: t.id, description: t.description });
    setTimeout(() => {
      setUndoRow((current) => (current?.id === t.id ? null : current));
    }, 8000);
  }

  async function handleUndo() {
    if (!undoRow) return;
    await restoreTransaction(undoRow.id);
    showToast("Transaction restored");
    setDeletingIds((current) => {
      const next = new Set(current);
      next.delete(undoRow.id);
      return next;
    });
    setUndoRow(null);
  }

  function toggleSelect(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((current) =>
      filtered.every((t) => current.has(t.id)) ? new Set() : new Set(filtered.map((t) => t.id)),
    );
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedIds.size} transaction${selectedIds.size === 1 ? "" : "s"}? This can be undone from each one's own undo toast right after — not in bulk.`)) {
      return;
    }
    setBulkBusy(true);
    const result = await bulkDeleteTransactions([...selectedIds]);
    setBulkBusy(false);
    if (!result.ok) {
      showToast(result.error ? `Couldn't delete: ${result.error}` : "Couldn't delete transactions");
      return;
    }
    showToast(`${selectedIds.size} transaction${selectedIds.size === 1 ? "" : "s"} deleted`);
    setSelectedIds(new Set());
  }

  async function handleBulkAccountChange(account_id: string) {
    if (!account_id || selectedIds.size === 0) return;
    setBulkBusy(true);
    const result = await bulkUpdateTransactions([...selectedIds], { account_id });
    setBulkBusy(false);
    if (!result.ok) {
      showToast(result.error ? `Couldn't update: ${result.error}` : "Couldn't change account");
      return;
    }
    showToast(`Account changed for ${selectedIds.size} transaction${selectedIds.size === 1 ? "" : "s"}`);
    setSelectedIds(new Set());
  }

  async function handleBulkDateChange(txn_date: string) {
    if (!txn_date || selectedIds.size === 0) return;
    setBulkBusy(true);
    const result = await bulkUpdateTransactions([...selectedIds], { txn_date });
    setBulkBusy(false);
    setBulkDate("");
    if (!result.ok) {
      showToast(result.error ? `Couldn't update: ${result.error}` : "Couldn't change date");
      return;
    }
    showToast(`Date changed for ${selectedIds.size} transaction${selectedIds.size === 1 ? "" : "s"}`);
    setSelectedIds(new Set());
  }

  async function handleBulkCategoryChange(category_id: string) {
    if (!category_id || selectedIds.size === 0) return;
    // A transfer can never carry a category (enforced by a DB constraint) —
    // silently drop any selected transfers from this particular action
    // rather than sending an update the database would reject wholesale.
    const targetIds = [...selectedIds].filter(
      (id) => filtered.find((t) => t.id === id)?.kind !== "transfer",
    );
    if (targetIds.length === 0) return;
    setBulkBusy(true);
    const result = await bulkUpdateTransactions(targetIds, { category_id });
    setBulkBusy(false);
    if (!result.ok) {
      showToast(result.error ? `Couldn't update: ${result.error}` : "Couldn't change category");
      return;
    }
    showToast(`Category changed for ${targetIds.length} transaction${targetIds.length === 1 ? "" : "s"}`);
    setSelectedIds(new Set());
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
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex gap-1 rounded-lg border border-border bg-surface p-1">
            {kindTabPill && (
              <div
                aria-hidden="true"
                className="absolute top-1 bottom-1 rounded-md bg-accent-soft transition-[left,width] duration-200 ease-out"
                style={{ left: kindTabPill.left, width: kindTabPill.width }}
              />
            )}
            {KIND_TABS.map((tab) => (
              <button
                key={tab.label}
                ref={(el) => {
                  if (el) kindTabRefs.current.set(tab.value, el);
                  else kindTabRefs.current.delete(tab.value);
                }}
                type="button"
                onClick={() => setKindFilter(tab.value)}
                className={`relative rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  kindFilter === tab.value
                    ? "text-accent"
                    : "text-text-muted hover:bg-bg"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        <PeriodSwitcher periods={periods} selectedId={selectedPeriodId} />
      </div>

      {selectedIds.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-accent-border bg-accent-soft px-4 py-2.5">
          <span className="text-sm font-semibold text-accent">
            {selectedIds.size} selected
          </span>
          <button
            type="button"
            onClick={handleBulkDelete}
            disabled={bulkBusy}
            className="text-xs font-medium text-negative hover:underline disabled:opacity-50"
          >
            Delete all
          </button>
          <select
            value=""
            disabled={bulkBusy}
            onChange={(e) => handleBulkAccountChange(e.target.value)}
            className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs text-text outline-none focus:border-accent disabled:opacity-50"
          >
            <option value="">Change account to…</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={bulkDate}
            disabled={bulkBusy}
            onChange={(e) => handleBulkDateChange(e.target.value)}
            className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs text-text outline-none focus:border-accent disabled:opacity-50"
          />
          <select
            value=""
            disabled={bulkBusy}
            onChange={(e) => handleBulkCategoryChange(e.target.value)}
            className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs text-text outline-none focus:border-accent disabled:opacity-50"
          >
            <option value="">Change category to…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="ml-auto text-xs font-medium text-accent hover:underline"
          >
            Clear selection
          </button>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        {flagFilter && (
          <button
            type="button"
            onClick={() => setFlagFilter("")}
            className="flex items-center gap-1.5 rounded-full border border-caution-border bg-caution-bg px-2.5 py-1 text-xs font-medium text-caution-strong"
          >
            {flagFilter === "pending" ? "Waiting for approval" : "Uncategorized"}
            <span aria-hidden="true">✕</span>
          </button>
        )}
        {(search || accountFilter || categoryFilter || kindFilter || flagFilter) && (
          <span className="text-xs text-text-faint">
            {filtered.length} of {transactions.length}
          </span>
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

      {/* Mobile: swipeable cards. Desktop: full table. A table row can't be
          reliably transform-animated for swipe gestures across browsers, so
          small screens get their own list instead of a squeezed table. */}
      <div key={kindFilter} className="animate-fade-in-up space-y-2 sm:hidden">
        {sortedFiltered.map((t, i) => (
          <MobileTransactionCard
            key={t.id}
            transaction={t}
            index={i}
            accountsById={accountsById}
            category={t.category_id ? (categoryRecordById.get(t.category_id) ?? null) : null}
            splitCount={splitsByTransaction?.get(t.id)?.length ?? null}
            onOpen={() => openDetail(t.id)}
            onDelete={() => handleDelete(t)}
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

      {openFilterCol && (
        <div className="fixed inset-0 z-20" onClick={() => setOpenFilterCol(null)} />
      )}

      <div
        key={kindFilter}
        className="animate-fade-in-up hidden overflow-x-auto rounded-xl border border-border bg-surface shadow-card sm:block"
      >
        <table className="w-full text-left [table-layout:fixed]">
          <thead>
            <tr className="border-b border-border bg-bg">
              <th
                style={{ width: 40 }}
                className="sticky top-0 z-10 bg-bg px-4 py-2 text-xs font-medium text-text-muted"
              >
                <input
                  type="checkbox"
                  checked={filtered.length > 0 && filtered.every((t) => selectedIds.has(t.id))}
                  onChange={toggleSelectAll}
                  aria-label="Select all"
                  className="h-4 w-4 accent-[var(--accent)]"
                />
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
                  title={SORTABLE_COLUMNS.has(col) ? "Click to sort, drag to reorder" : "Drag to reorder"}
                >
                  <span
                    className={`relative flex items-center gap-1 ${
                      col === "amount" ? "justify-end" : ""
                    }`}
                  >
                    {SORTABLE_COLUMNS.has(col) ? (
                      <button
                        type="button"
                        onClick={() => handleSortClick(col)}
                        className={`inline-flex items-center gap-1 transition-colors hover:text-text ${
                          sortColumn === col ? "text-accent" : ""
                        }`}
                      >
                        {COLUMN_LABELS[col]}
                        {sortColumn === col && (
                          <span aria-hidden="true">{sortDirection === "asc" ? "↑" : "↓"}</span>
                        )}
                      </button>
                    ) : (
                      COLUMN_LABELS[col]
                    )}
                    {FILTERABLE_COLUMNS.has(col) && (
                      <button
                        type="button"
                        draggable={false}
                        onDragStart={(e) => e.preventDefault()}
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenFilterCol((current) => (current === col ? null : col));
                        }}
                        aria-label={`Filter ${COLUMN_LABELS[col]}`}
                        className={`rounded p-0.5 transition-colors hover:bg-border ${
                          columnHasFilter(col) ? "text-accent" : "text-text-faint"
                        }`}
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                          <path
                            d="M4 5h16l-6.5 7.5V19l-3-1.5v-5L4 5Z"
                            stroke="currentColor"
                            strokeWidth={2}
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    )}
                    <span
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        startResize(col, e.clientX);
                      }}
                      className="absolute inset-y-0 -right-4 z-20 w-2 cursor-col-resize touch-none hover:bg-accent-border active:bg-accent"
                    />
                    {openFilterCol === col && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="animate-modal-panel absolute top-full left-0 z-30 mt-1 w-48 cursor-auto rounded-lg border border-border bg-surface p-2 font-normal normal-case shadow-modal"
                      >
                        {col === "category" && (
                          <select
                            value={categoryFilter}
                            onChange={(e) => setCategoryFilter(e.target.value)}
                            className="w-full rounded border border-border bg-bg px-1.5 py-1 text-xs text-text outline-none focus:border-accent"
                          >
                            <option value="">All</option>
                            {categories.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        )}
                        {col === "amount" && (
                          <div className="flex flex-col gap-1">
                            <input
                              type="number"
                              placeholder="Min"
                              value={amountMin}
                              onChange={(e) => setAmountMin(e.target.value)}
                              className="w-full rounded border border-border bg-bg px-1.5 py-1 text-[11px] text-text outline-none focus:border-accent"
                            />
                            <input
                              type="number"
                              placeholder="Max"
                              value={amountMax}
                              onChange={(e) => setAmountMax(e.target.value)}
                              className="w-full rounded border border-border bg-bg px-1.5 py-1 text-[11px] text-text outline-none focus:border-accent"
                            />
                          </div>
                        )}
                        {columnHasFilter(col) && (
                          <button
                            type="button"
                            onClick={() => clearColumnFilter(col)}
                            className="mt-1.5 text-[11px] font-medium text-accent hover:underline"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    )}
                  </span>
                </th>
              ))}
              <th style={{ width: 150 }} className="sticky top-0 z-10 bg-bg px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {sortedFiltered.map((t) => {
                const p = presentTransaction(t, accountsById);
                const displayDescription = p.displayDescription;
                return (
                <Fragment key={t.id}>
                  <tr
                    ref={(el) => {
                      if (el) rowRefs.current.set(t.id, el);
                      else rowRefs.current.delete(t.id);
                    }}
                    onClick={() => openDetail(t.id)}
                    className={`h-14 cursor-pointer overflow-hidden border-b border-border transition-[opacity,background-color] duration-300 last:border-b-0 hover:bg-bg even:bg-bg/40 ${
                      deletingIds.has(t.id) ? "opacity-0" : "opacity-100"
                    } ${isPendingTransaction(t) ? "animate-pulse pointer-events-none opacity-60" : ""} ${newIds.has(t.id) ? "animate-row-highlight" : ""} ${
                      selectedIds.has(t.id) ? "bg-accent-soft/60" : ""
                    }`}
                  >
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(t.id)}
                        onChange={() => toggleSelect(t.id)}
                        aria-label={`Select ${t.description}`}
                        className="h-4 w-4 accent-[var(--accent)]"
                      />
                    </td>
                    {columnOrder.map((col) => (
                      <td
                        key={col}
                        style={{ width: columnWidths[col] }}
                        className={
                          col === "amount"
                            ? "overflow-hidden px-4 py-3 text-right text-sm font-medium"
                            : "overflow-hidden px-4 py-3 text-sm text-text-muted"
                        }
                      >
                        {col === "description" && (
                          <div className="flex items-center gap-3">
                            <TransactionAvatar label={displayDescription} size="sm" />
                            <div className="flex min-w-0 items-center gap-1.5">
                              <span className="truncate text-sm font-medium text-text">
                                {displayDescription}
                              </span>
                              <RowFlags
                                transaction={t}
                                onApprove={() => toggleTransactionPendingApproval(t.id, false)}
                              />
                            </div>
                          </div>
                        )}
                        {col === "category" &&
                          (t.category_id && categoryRecordById.get(t.category_id) ? (
                            <CategoryChip
                              id={t.category_id}
                              name={categoryRecordById.get(t.category_id)!.name}
                              icon={categoryRecordById.get(t.category_id)!.icon}
                              size="xs"
                            />
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
                            <div className="flex items-center gap-1.5 truncate">
                              {t.account_id && accountBankById.get(t.account_id) && (
                                <BankLogo bank={accountBankById.get(t.account_id)!} size="sm" />
                              )}
                              <span className="truncate">
                                {t.account_id
                                  ? (accountById.get(t.account_id) ?? "—")
                                  : "—"}
                              </span>
                              <span className="shrink-0">→</span>
                              {t.to_account_id && accountBankById.get(t.to_account_id) && (
                                <BankLogo bank={accountBankById.get(t.to_account_id)!} size="sm" />
                              )}
                              <span className="truncate">
                                {t.to_account_id
                                  ? (accountById.get(t.to_account_id) ?? "—")
                                  : "—"}
                              </span>
                            </div>
                          ) : t.account_id ? (
                            <div className="flex items-center gap-1.5 truncate">
                              {accountBankById.get(t.account_id) && (
                                <BankLogo bank={accountBankById.get(t.account_id)!} size="sm" />
                              )}
                              <span className="truncate">{accountById.get(t.account_id)}</span>
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
                          <TransactionAmount amount={t.amount} presentation={p} />
                        )}
                        {col === "notes" && (
                          <span className="block truncate" title={t.notes ?? undefined}>
                            {t.notes || "—"}
                          </span>
                        )}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => handleDelete(t)}
                        className="inline-block py-2 text-xs text-text-faint transition-colors hover:text-negative"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                </Fragment>
                );
              })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-6 py-4">
                  <EmptyState
                    message={
                      transactions.length === 0
                        ? "No transactions logged for this period yet."
                        : "No transactions match your search/filters."
                    }
                    shortcut={
                      transactions.length === 0
                        ? { keys: ["⌥", "E"], label: "to log an expense" }
                        : undefined
                    }
                    action={
                      transactions.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => {
                            setSearch("");
                            setAccountFilter("");
                            setCategoryFilter("");
                            setKindFilter("");
                            setFlagFilter("");
                            setAmountMin("");
                            setAmountMax("");
                          }}
                          className="text-xs font-medium text-accent underline underline-offset-2"
                        >
                          Clear filters
                        </button>
                      ) : undefined
                    }
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editingId &&
        (() => {
          const detailTransaction = effectiveTransactions.find((t) => t.id === editingId);
          if (!detailTransaction) return null;
          return (
            <TransactionDetailModal
              transaction={detailTransaction}
              accounts={accounts}
              categories={categories}
              knownCreators={knownCreators}
              accountName={
                detailTransaction.account_id
                  ? (accountById.get(detailTransaction.account_id) ?? "—")
                  : "—"
              }
              toAccountName={
                detailTransaction.to_account_id
                  ? (accountById.get(detailTransaction.to_account_id) ?? "—")
                  : null
              }
              closing={detailClosing}
              onClose={closeDetail}
            />
          );
        })()}
    </div>
  );
}

// Swipe left to reveal Delete — mirrors common mobile mail/messaging apps
// instead of requiring a tap into a cramped edit form just to remove a row.
// The row itself is the shared TransactionRow; this only adds the swipe
// chrome.
function MobileTransactionCard({
  transaction: t,
  index,
  accountsById,
  category,
  splitCount,
  onOpen,
  onDelete,
}: {
  transaction: Transaction;
  index: number;
  accountsById: ReturnType<typeof toAccountLookup>;
  category: Category | null;
  splitCount: number | null;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const [dragX, setDragX] = useState(0);
  // Whether a touch is actively in progress — this affects the rendered
  // transition (no easing while dragging, snap-back easing once released),
  // so it has to be state rather than a ref: reading a ref's `.current`
  // during render isn't safe and can silently disagree with what actually
  // rendered on a given frame.
  const [isDragging, setIsDragging] = useState(false);
  const startX = useRef<number | null>(null);
  const moved = useRef(false);
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
    moved.current = false;
    setIsDragging(true);
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (startX.current === null) return;
    const delta = e.touches[0].clientX - startX.current;
    if (Math.abs(delta) > 6) moved.current = true;
    const next = Math.max(-120, Math.min(0, delta));
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
    }
    setDragX(0);
  }

  return (
    <div className="relative overflow-hidden rounded-xl">
      <div className="absolute inset-0 flex items-center justify-end px-4">
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
        className="card-flush relative p-3.5"
      >
        <TransactionRow
          bare
          transaction={t}
          accountsById={accountsById}
          category={category}
          categorySlot={
            splitCount ? (
              <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent">
                Split ({splitCount})
              </span>
            ) : undefined
          }
          index={index}
          onClick={() => {
            // A swipe that ended on the row shouldn't also open it.
            if (!moved.current) onOpen();
          }}
        />
      </div>
    </div>
  );
}
