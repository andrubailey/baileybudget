"use client";

import { useRef, useState } from "react";
import { updateTransaction, updateTransactionCreator } from "@/app/actions";
import { formatMoney, formatDate } from "@/lib/format";
import type { Account, Category, Transaction } from "@/lib/types";
import { FIELD_CLASS as fieldClass } from "@/lib/ui";
import { useToast } from "@/app/(app)/toast";
import { CategorySelect } from "@/app/(app)/category-select";

// Shared "click a transaction to see/edit it" modal — the Transactions
// table and the Overview page's Recent Transactions list both open this
// same component instead of each maintaining their own edit form. Shows a
// full editable form for income/expense, and a read-only detail view for
// transfers (mirroring the old inline Edit button's behavior of not
// offering an edit path for those at all).
export function TransactionDetailModal({
  transaction: t,
  accounts,
  categories,
  accountName,
  toAccountName,
  closing,
  onClose,
  knownCreators,
}: {
  transaction: Transaction;
  accounts: Account[];
  categories: Category[];
  accountName: string;
  toAccountName: string | null;
  closing: boolean;
  onClose: () => void;
  knownCreators: { id: string | null; email: string }[];
}) {
  const [creatorEmail, setCreatorEmail] = useState(t.created_by_email ?? "");
  const [updatingCreator, setUpdatingCreator] = useState(false);
  const showToast = useToast();

  async function handleCreatorChange(email: string) {
    const previous = creatorEmail;
    setCreatorEmail(email);
    setUpdatingCreator(true);
    const match = knownCreators.find((c) => c.email === email);
    const result = await updateTransactionCreator(t.id, match?.id ?? null, email || null);
    setUpdatingCreator(false);
    if (!result.ok) {
      setCreatorEmail(previous);
      showToast(result.error ? `Couldn't update: ${result.error}` : "Couldn't update creator");
      return;
    }
    showToast("Created by updated");
  }

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
  const [categoryId, setCategoryId] = useState(t.category_id ?? "");
  const formRef = useRef<HTMLFormElement>(null);

  // Closing the modal — click outside, the ✕ button, or the Done button —
  // plays the exit animation immediately instead of waiting on the network,
  // which is what made every open/close feel like it stuttered. The save
  // (skipped for the transfer read-only view, or if a required field was
  // cleared) runs in the background afterward and doesn't touch the modal's
  // open/close state.
  function handleClose() {
    onClose();
    if (t.kind === "transfer") return;
    const form = formRef.current;
    if (!form || !form.reportValidity()) return;
    const formData = new FormData(form);
    formData.set("kind", effectiveKind);
    updateTransaction(t.id, formData).catch(() =>
      showToast("Couldn't save your changes"),
    );
  }

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 ${
        closing ? "animate-modal-backdrop-out" : "animate-modal-backdrop"
      }`}
      onClick={handleClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-lg overflow-hidden rounded-xl border border-border bg-surface shadow-modal ${
          closing ? "animate-modal-panel-out" : "animate-modal-panel"
        }`}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold text-text">Transaction details</h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="-mr-1.5 flex size-9 shrink-0 items-center justify-center rounded-lg text-text-faint transition-colors hover:bg-bg hover:text-text"
          >
            ✕
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 border-b border-border bg-bg px-5 py-2.5 text-xs">
          <span className="shrink-0 text-text-faint">Created by</span>
          <select
            value={creatorEmail}
            disabled={updatingCreator}
            onChange={(e) => handleCreatorChange(e.target.value)}
            className="min-w-0 rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium text-text-muted disabled:opacity-50"
          >
            {!creatorEmail && <option value="">Unknown</option>}
            {creatorEmail && !knownCreators.some((c) => c.email === creatorEmail) && (
              <option value={creatorEmail}>{creatorEmail}</option>
            )}
            {knownCreators.map((c) => (
              <option key={c.email} value={c.email}>
                {c.email}
              </option>
            ))}
          </select>
        </div>

        {t.kind === "transfer" ? (
          <div className="space-y-3 p-5 text-sm">
            <div className="flex justify-between">
              <span className="text-text-muted">Amount</span>
              <span className="font-medium text-text">{formatMoney(t.amount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">From</span>
              <span className="font-medium text-text">{accountName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">To</span>
              <span className="font-medium text-text">{toAccountName ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Date</span>
              <span className="font-medium text-text">{formatDate(t.txn_date)}</span>
            </div>
            {t.notes && (
              <div className="flex justify-between gap-4">
                <span className="shrink-0 text-text-muted">Notes</span>
                <span className="text-right font-medium text-text">{t.notes}</span>
              </div>
            )}
          </div>
        ) : (
          <form
            ref={formRef}
            onSubmit={(e) => {
              e.preventDefault();
              handleClose();
            }}
            className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2"
          >
            <div className="space-y-1">
              <label className="text-xs font-medium text-text-muted">Type</label>
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
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-text-muted">Amount</label>
              <input
                type="number"
                step="0.01"
                name="amount"
                required
                defaultValue={t.amount}
                className={fieldClass}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-medium text-text-muted">Description</label>
              <input
                name="description"
                required
                defaultValue={t.description}
                className={fieldClass}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-text-muted">Date</label>
              <input
                type="date"
                name="txn_date"
                required
                defaultValue={t.txn_date}
                className={fieldClass}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-text-muted">Account</label>
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
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-medium text-text-muted">Category</label>
              <CategorySelect
                categories={categories}
                kind={kind}
                value={categoryId}
                onChange={setCategoryId}
                className={fieldClass}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-medium text-text-muted">Notes</label>
              <input
                name="notes"
                defaultValue={t.notes ?? ""}
                maxLength={140}
                className={fieldClass}
              />
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
