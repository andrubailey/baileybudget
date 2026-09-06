"use client";

import { Fragment, useMemo, useState } from "react";
import {
  deleteTransaction,
  getHistoryForTransaction,
  restoreTransaction,
  toggleTransactionCleared,
  updateTransaction,
} from "@/app/actions";
import { formatMoney, formatDate } from "@/lib/format";
import type { Account, Category, Transaction, TransactionHistoryEntry } from "@/lib/types";
import type { SplitDetail } from "@/lib/queries";
import { SubmitButton } from "@/app/(app)/submit-button";
import { BankLogo } from "@/app/(app)/accounts/bank-logo";
import { getAvatarColors } from "@/lib/avatar-colors";

const fieldClass =
  "w-full rounded-md border border-border bg-bg px-2 py-1 text-sm text-text outline-none focus:border-accent";

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
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

  const accountById = useMemo(
    () => new Map(accounts.map((a) => [a.id, a.name])),
    [accounts],
  );
  const accountBankById = useMemo(
    () => new Map(accounts.map((a) => [a.id, a.bank])),
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

      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)]">
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
                  onDone={() => setEditingId(null)}
                />
              ) : (
                <Fragment key={t.id}>
                <tr className="border-b border-border last:border-b-0">
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
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-black/5 bg-bg text-xs font-semibold text-text-faint">
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
                        {t.account_id && accountBankById.get(t.account_id) && (
                          <BankLogo bank={accountBankById.get(t.account_id)!} size="sm" />
                        )}
                        <span>{t.account_id ? (accountById.get(t.account_id) ?? "—") : "—"}</span>
                        <span>→</span>
                        {t.to_account_id && accountBankById.get(t.to_account_id) && (
                          <BankLogo bank={accountBankById.get(t.to_account_id)!} size="sm" />
                        )}
                        <span>
                          {t.to_account_id ? (accountById.get(t.to_account_id) ?? "—") : "—"}
                        </span>
                      </div>
                    ) : t.account_id ? (
                      <div className="flex items-center gap-1.5">
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

function EditRow({
  transaction: t,
  accounts,
  categories,
  onDone,
}: {
  transaction: Transaction;
  accounts: Account[];
  categories: Category[];
  onDone: () => void;
}) {
  const [kind, setKind] = useState<"income" | "expense">(
    t.kind === "income" ? "income" : "expense",
  );
  const filteredCategories = categories.filter((c) => c.kind === kind);

  return (
    <tr className="border-b border-border bg-bg/40 last:border-b-0">
      <td colSpan={8} className="p-4">
        <form
          action={async (formData) => {
            await updateTransaction(t.id, formData);
            onDone();
          }}
          className="grid grid-cols-1 gap-3 sm:grid-cols-3"
        >
          <select
            name="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as "income" | "expense")}
            className={fieldClass}
          >
            <option value="expense">Expense</option>
            <option value="income">Income</option>
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
          <select name="account_id" defaultValue={t.account_id ?? ""} className={fieldClass}>
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
              onClick={onDone}
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
