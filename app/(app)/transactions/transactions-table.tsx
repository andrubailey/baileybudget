"use client";

import { Fragment, useMemo, useRef, useState } from "react";
import {
  deleteTransaction,
  getHistoryForTransaction,
  restoreTransaction,
  toggleTransactionCleared,
  toggleTransactionPendingApproval,
  updateTransaction,
} from "@/app/actions";
import { formatMoney, formatDate } from "@/lib/format";
import type { Account, Category, Transaction, TransactionHistoryEntry } from "@/lib/types";
import type { SplitDetail } from "@/lib/queries";
import { SubmitButton } from "@/app/(app)/submit-button";
import { BankLogo } from "@/app/(app)/accounts/bank-logo";
import { getAvatarColors } from "@/lib/avatar-colors";
import { getAccountColor } from "@/lib/account-colors";

// text-base (16px) on mobile prevents iOS Safari's auto-zoom-on-focus.
const fieldClass =
  "w-full rounded-md border border-border bg-bg px-2 py-1.5 text-base sm:py-1 sm:text-sm text-text outline-none focus:border-accent";

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
  fd.set("category_id", snapshot.category_id ? String(snapshot.category_id) : "");
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
}: {
  transactions: Transaction[];
  accounts: Account[];
  categories: Category[];
  splitsByTransaction?: Map<string, SplitDetail[]>;
  initialCategoryFilter?: string;
  initialAccountFilter?: string;
}) {
  const [search, setSearch] = useState("");
  const [accountFilter, setAccountFilter] = useState(initialAccountFilter ?? "");
  const [categoryFilter, setCategoryFilter] = useState(initialCategoryFilter ?? "");
  const [kindFilter, setKindFilter] = useState<"" | "income" | "expense" | "transfer">("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [historyEntries, setHistoryEntries] = useState<TransactionHistoryEntry[]>([]);
  const [undoRow, setUndoRow] = useState<{ id: string; description: string } | null>(
    null,
  );
  const [editUndo, setEditUndo] = useState<{ id: string; snapshot: Record<string, unknown> } | null>(
    null,
  );

  const accountById = useMemo(
    () => new Map(accounts.map((a) => [a.id, a.name])),
    [accounts],
  );
  const accountBankById = useMemo(
    () => new Map(accounts.map((a) => [a.id, a.bank])),
    [accounts],
  );
  const accountColorById = useMemo(
    () => new Map(accounts.map((a) => [a.id, getAccountColor(a.account_type, a.is_debt)])),
    [accounts],
  );
  const categoryById = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories],
  );

  const filtered = transactions.filter((t) => {
    if (kindFilter && t.kind !== kindFilter) return false;
    if (accountFilter && t.account_id !== accountFilter && t.to_account_id !== accountFilter) {
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
    await deleteTransaction(t.id);
    setUndoRow({ id: t.id, description: t.description });
    setTimeout(() => {
      setUndoRow((current) => (current?.id === t.id ? null : current));
    }, 8000);
  }

  async function handleUndo() {
    if (!undoRow) return;
    await restoreTransaction(undoRow.id);
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

  async function handleMarkAllCleared() {
    await Promise.all(uncleared.map((t) => toggleTransactionCleared(t.id, true)));
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
        <div className="flex rounded-lg border border-border bg-surface p-1">
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
        {(kindFilter === "" || kindFilter === "income" || kindFilter === "expense") && (
          <span className="tabular text-xs text-text-muted">
            {kindFilter !== "expense" && (
              <span className="text-success">+{formatMoney(filteredIncome)}</span>
            )}
            {kindFilter === "" && " · "}
            {kindFilter !== "income" && <span>-{formatMoney(filteredExpense)}</span>}
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
            className="text-xs font-medium text-accent hover:underline"
          >
            Mark {uncleared.length} cleared
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
          <span className="text-accent">Deleted &ldquo;{undoRow.description}&rdquo;.</span>
          <button
            type="button"
            onClick={handleUndo}
            className="font-semibold text-accent underline underline-offset-2"
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
            className="font-semibold text-accent underline underline-offset-2"
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
            accountName={t.account_id ? (accountById.get(t.account_id) ?? "—") : "—"}
            accountColor={t.account_id ? accountColorById.get(t.account_id) : undefined}
            categoryName={t.category_id ? (categoryById.get(t.category_id) ?? null) : null}
            onDelete={() => handleDelete(t)}
            onToggleCleared={(cleared) => toggleTransactionCleared(t.id, cleared)}
          />
        ))}
        {filtered.length === 0 && (
          <p className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-text-muted">
            {transactions.length === 0
              ? "No transactions logged for this period yet."
              : "No transactions match your search/filters."}
          </p>
        )}
      </div>

      <div className="hidden overflow-x-auto rounded-xl border border-border bg-surface shadow-card sm:block">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border bg-bg">
              <th className="px-4 py-2 text-xs font-medium text-text-muted">✓</th>
              <th className="px-4 py-2 text-xs font-medium text-text-muted">Description</th>
              <th className="px-4 py-2 text-xs font-medium text-text-muted">Category</th>
              <th className="px-4 py-2 text-xs font-medium text-text-muted">Account</th>
              <th className="px-4 py-2 text-xs font-medium text-text-muted">Date</th>
              <th className="px-4 py-2 text-xs font-medium text-text-muted">By</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-text-muted">
                Amount
              </th>
              <th className="px-4 py-2" />
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
                <tr className="border-b border-border last:border-b-0 hover:bg-bg even:bg-bg/40">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={t.cleared}
                      onChange={(e) => toggleTransactionCleared(t.id, e.target.checked)}
                      title={t.cleared ? "Cleared" : "Pending — mark cleared"}
                      className="h-4 w-4 accent-[var(--accent)]"
                    />
                  </td>
                  <td className="px-4 py-3">
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
                            <span className="shrink-0 text-xs" title="Recurring">
                              🔁
                            </span>
                          )}
                          {t.pending_approval && (
                            <button
                              type="button"
                              onClick={() => toggleTransactionPendingApproval(t.id, false)}
                              title="Needs approval — click to approve"
                              className="shrink-0 rounded-full bg-[#fef0c7] px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap text-[#93370d] hover:bg-[#fde3a7]"
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
                  </td>
                  <td className="px-4 py-3 text-sm text-text-muted">
                    {t.category_id ? (
                      categoryById.get(t.category_id)
                    ) : splitsByTransaction?.has(t.id) ? (
                      <span
                        className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent"
                        title={splitsByTransaction
                          .get(t.id)!
                          .map((s) => `${s.category_id ? (categoryById.get(s.category_id) ?? "—") : "—"}: ${formatMoney(s.amount)}`)
                          .join(", ")}
                      >
                        Split ({splitsByTransaction.get(t.id)!.length})
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-text-muted">
                    {t.kind === "transfer" ? (
                      <div className="flex items-center gap-1.5">
                        {t.account_id && (
                          <span
                            className="size-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: accountColorById.get(t.account_id) }}
                          />
                        )}
                        {t.account_id && accountBankById.get(t.account_id) && (
                          <BankLogo bank={accountBankById.get(t.account_id)!} size="sm" />
                        )}
                        <span>{t.account_id ? (accountById.get(t.account_id) ?? "—") : "—"}</span>
                        <span>→</span>
                        {t.to_account_id && (
                          <span
                            className="size-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: accountColorById.get(t.to_account_id) }}
                          />
                        )}
                        {t.to_account_id && accountBankById.get(t.to_account_id) && (
                          <BankLogo bank={accountBankById.get(t.to_account_id)!} size="sm" />
                        )}
                        <span>
                          {t.to_account_id ? (accountById.get(t.to_account_id) ?? "—") : "—"}
                        </span>
                      </div>
                    ) : t.account_id ? (
                      <div className="flex items-center gap-1.5">
                        <span
                          className="size-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: accountColorById.get(t.account_id) }}
                        />
                        {accountBankById.get(t.account_id) && (
                          <BankLogo bank={accountBankById.get(t.account_id)!} size="sm" />
                        )}
                        <span>{accountById.get(t.account_id)}</span>
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-text-muted">{formatDate(t.txn_date)}</td>
                  <td className="px-4 py-3">
                    {creatorInitial(t.created_by_email) && (
                      <span
                        title={t.created_by_email ?? undefined}
                        className="flex size-6 items-center justify-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent"
                      >
                        {creatorInitial(t.created_by_email)}
                      </span>
                    )}
                  </td>
                  <td
                    className={`tabular px-4 py-3 text-right text-sm font-medium ${
                      t.kind === "income" ? "text-success" : "text-text"
                    }`}
                  >
                    {t.kind === "income" ? "+" : t.kind === "expense" ? "-" : ""}
                    {formatMoney(t.amount)}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {t.kind !== "transfer" && (
                      <button
                        type="button"
                        onClick={() => setEditingId(t.id)}
                        className="mr-3 text-xs text-text-faint hover:text-accent"
                      >
                        Edit
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleHistory(t.id)}
                      className="mr-3 text-xs text-text-faint hover:text-accent"
                    >
                      History
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(t)}
                      className="text-xs text-text-faint hover:text-[#f04438]"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
                {historyId === t.id && (
                  <tr className="border-b border-border bg-bg/40 last:border-b-0">
                    <td colSpan={8} className="px-4 py-3">
                      {historyEntries.length === 0 ? (
                        <p className="text-xs text-text-muted">No edits recorded for this transaction yet.</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {historyEntries.map((h) => (
                            <li key={h.id} className="text-xs text-text-muted">
                              <span className="font-medium text-text">
                                {h.edited_by_email ?? "Someone"}
                              </span>{" "}
                              edited this on {formatDate(h.edited_at.slice(0, 10))} — previously &ldquo;
                              {String(h.snapshot.description)}&rdquo; for {formatMoney(Number(h.snapshot.amount))}
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
                <td colSpan={8} className="px-6 py-10 text-center text-sm text-text-muted">
                  {transactions.length === 0
                    ? "No transactions logged for this period yet."
                    : "No transactions match your search/filters."}
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
  const startX = useRef<number | null>(null);
  const dragging = useRef(false);
  const SWIPE_THRESHOLD = 72;

  function handleTouchStart(e: React.TouchEvent) {
    startX.current = e.touches[0].clientX;
    dragging.current = true;
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (!dragging.current || startX.current === null) return;
    const delta = e.touches[0].clientX - startX.current;
    setDragX(Math.max(-120, Math.min(120, delta)));
  }

  function handleTouchEnd() {
    dragging.current = false;
    if (dragX <= -SWIPE_THRESHOLD) {
      onDelete();
    } else if (dragX >= SWIPE_THRESHOLD) {
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
        <span className="text-xs font-semibold text-[#f04438]">Delete</span>
      </div>
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ transform: `translateX(${dragX}px)`, transition: dragging.current ? "none" : "transform 150ms" }}
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
              <span className="shrink-0 rounded-full bg-[#fef0c7] px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap text-[#93370d]">
                Needs approval
              </span>
            )}
          </p>
          <p className="flex items-center gap-1.5 truncate text-xs text-text-faint">
            {accountColor && (
              <span
                className="size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: accountColor }}
              />
            )}
            <span className="truncate">{accountName}</span>
            {categoryName && <span>· {categoryName}</span>}
            <span>· {formatDate(t.txn_date)}</span>
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
        {!t.cleared && <span className="size-1.5 shrink-0 rounded-full bg-[#f79009]" title="Pending" />}
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
  const initialIsDebtAccount = accounts.find((a) => a.id === t.account_id)?.is_debt ?? false;
  const [kind, setKind] = useState<"income" | "expense">(
    initialIsDebtAccount ? (t.kind === "income" ? "expense" : "income") : t.kind === "income" ? "income" : "expense",
  );
  const isDebtAccount = accounts.find((a) => a.id === accountId)?.is_debt ?? false;
  const effectiveKind = isDebtAccount ? (kind === "expense" ? "income" : "expense") : kind;
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
            <option value="expense">{isDebtAccount ? "Charge" : "Expense"}</option>
            <option value="income">{isDebtAccount ? "Payment" : "Income"}</option>
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
