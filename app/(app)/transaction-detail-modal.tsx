"use client";

import { useRef, useState } from "react";
import {
  createRecurringFromTransaction,
  toggleRecurringActive,
  updateTransaction,
  updateTransactionCreator,
} from "@/app/actions";
import { formatDate } from "@/lib/format";
import type { Account, Category, Transaction } from "@/lib/types";
import { FIELD_CLASS as fieldClass } from "@/lib/ui";
import { useToast } from "@/app/(app)/toast";
import { CategorySelect } from "@/app/(app)/category-select";
import { CurrencyInput } from "@/app/(app)/currency-input";
import { Money } from "@/app/(app)/money";
import { TransactionAvatar } from "@/app/(app)/transaction-row";

// Shared "click a transaction to see/edit it" modal — the Transactions
// table and the Overview page's Recent Transactions list both open this
// same component. Autosaves on close: there's no Save button, closing the
// modal (backdrop, ✕, Enter) writes whatever changed.
//
// Layout: a header that reads like the row you clicked (avatar, name,
// amount), a Type/Amount pair up top since those are the facts most edits
// touch, then the rest of the fields in a quiet two-column grid, and
// attribution/recurring tucked into a footer so they don't compete with
// the data.
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
    }
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
  const [description, setDescription] = useState(t.description);
  const wasRecurring = !!t.recurring_transaction_id;
  const [isRecurring, setIsRecurring] = useState(wasRecurring);
  const formRef = useRef<HTMLFormElement>(null);

  // Closing the modal — click outside, the ✕ button, or Enter — plays the
  // exit animation immediately instead of waiting on the network. The save
  // (skipped for the transfer read-only view, or if a required field was
  // cleared) runs in the background afterward.
  function handleClose() {
    onClose();
    if (t.kind === "transfer") return;
    const form = formRef.current;
    if (!form || !form.reportValidity()) return;
    const formData = new FormData(form);
    formData.set("kind", effectiveKind);
    updateTransaction(t.id, formData)
      .then(() => showToast("Transaction saved"))
      .catch(() => showToast("Couldn't save your changes"));

    if (isRecurring !== wasRecurring) {
      if (isRecurring) {
        createRecurringFromTransaction(t.id).catch(() =>
          showToast("Couldn't set up recurring"),
        );
      } else if (t.recurring_transaction_id) {
        toggleRecurringActive(t.recurring_transaction_id, false).catch(() =>
          showToast("Couldn't stop recurring"),
        );
      }
    }
  }

  const isTransfer = t.kind === "transfer";
  const headerSign = isTransfer ? "none" : kind === "income" ? "+" : "-";
  const headerTone = !isTransfer && kind === "income" ? "positive" : "neutral";
  const selectedAccountName = accounts.find((a) => a.id === accountId)?.name;
  const typeOptions: { value: "expense" | "income"; label: string }[] = [
    { value: "expense", label: isDebtAccount ? "Charge" : "Expense" },
    { value: "income", label: isDebtAccount ? "Payment" : "Income" },
  ];

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-end justify-center bg-black/40 sm:items-center sm:p-4 ${
        closing ? "animate-modal-backdrop-out" : "animate-modal-backdrop"
      }`}
      onClick={handleClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`Edit ${t.description}`}
        className={`w-full max-w-md overflow-hidden rounded-t-2xl border border-border bg-surface shadow-modal sm:rounded-xl ${
          closing ? "animate-modal-panel-out" : "animate-modal-panel"
        }`}
      >
        {/* Header — reads like the row that was clicked. */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-4">
          <TransactionAvatar label={description || t.description} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-text">
              {description || "Untitled"}
            </p>
            <p className="text-metadata truncate">
              {formatDate(t.txn_date)}
              {isTransfer
                ? ` · ${accountName} → ${toAccountName ?? "—"}`
                : selectedAccountName
                  ? ` · ${selectedAccountName}`
                  : ""}
            </p>
          </div>
          <Money
            amount={t.amount}
            signDisplay={headerSign}
            tone={headerTone}
            className="shrink-0 text-lg font-semibold"
          />
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="-mr-1.5 flex size-9 shrink-0 items-center justify-center rounded-lg text-text-faint transition-colors hover:bg-bg hover:text-text"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {isTransfer ? (
          <dl className="divide-y divide-border border-t border-border text-sm">
            <Row label="Amount">
              <Money amount={t.amount} />
            </Row>
            <Row label="From">{accountName}</Row>
            <Row label="To">{toAccountName ?? "—"}</Row>
            <Row label="Date">{formatDate(t.txn_date)}</Row>
            {t.notes && <Row label="Notes">{t.notes}</Row>}
          </dl>
        ) : (
          <form
            ref={formRef}
            onSubmit={(e) => {
              e.preventDefault();
              handleClose();
            }}
            className="border-t border-border"
          >
            <div className="space-y-4 px-5 py-4">
              {/* Type + amount: the two things most edits are about. */}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Type">
                  <div className="flex h-[42px] rounded-lg border border-border bg-bg p-0.5 sm:h-[38px]">
                    {typeOptions.map((o) => (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => setKind(o.value)}
                        className={`flex-1 rounded-md text-sm font-medium transition-colors ${
                          kind === o.value
                            ? "bg-surface text-text shadow-card"
                            : "text-text-muted hover:text-text"
                        }`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Amount">
                  <CurrencyInput
                    name="amount"
                    required
                    defaultValue={t.amount}
                    className={`${fieldClass} pl-7`}
                  />
                </Field>
              </div>

              <Field label="Description">
                <input
                  name="description"
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className={fieldClass}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Date">
                  <input
                    type="date"
                    name="txn_date"
                    required
                    defaultValue={t.txn_date}
                    className={fieldClass}
                  />
                </Field>
                <Field label="Account">
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
                </Field>
              </div>

              <Field label="Category">
                <CategorySelect
                  categories={categories}
                  kind={kind}
                  value={categoryId}
                  onChange={setCategoryId}
                  className={fieldClass}
                />
              </Field>

              <Field label="Notes" optional>
                <input
                  name="notes"
                  defaultValue={t.notes ?? ""}
                  maxLength={140}
                  placeholder="Anything worth remembering"
                  className={fieldClass}
                />
              </Field>
            </div>

            {/* Footer: settings about the transaction, not the transaction itself. */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-bg px-5 py-3 text-xs">
              <button
                type="button"
                role="switch"
                aria-checked={isRecurring}
                onClick={() => setIsRecurring((v) => !v)}
                className="flex items-center gap-2 text-text-muted"
              >
                <span
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                    isRecurring ? "bg-accent" : "bg-neutral-track"
                  }`}
                >
                  <span
                    className={`inline-block size-4 rounded-full bg-white shadow-card transition-transform ${
                      isRecurring ? "translate-x-4" : "translate-x-0.5"
                    }`}
                  />
                </span>
                Repeats monthly
              </button>
              <label className="flex items-center gap-1.5 text-text-faint">
                Logged by
                <select
                  value={creatorEmail}
                  disabled={updatingCreator}
                  onChange={(e) => handleCreatorChange(e.target.value)}
                  className="max-w-[11rem] truncate rounded-md border border-border bg-surface px-1.5 py-1 text-xs font-medium text-text-muted disabled:opacity-50"
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
              </label>
            </div>
            <p className="px-5 py-2 text-center text-[11px] text-text-faint">
              Changes save when you close.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  optional,
  children,
}: {
  label: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-metadata block">
        {label}
        {optional && <span className="font-normal opacity-70"> · optional</span>}
      </span>
      {children}
    </label>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-5 py-3">
      <dt className="shrink-0 text-text-muted">{label}</dt>
      <dd className="text-right font-medium text-text">{children}</dd>
    </div>
  );
}
