"use client";

import { useState } from "react";
import { checkDuplicateTransaction, createTransaction, suggestCategory } from "@/app/actions";
import type { Account, Category } from "@/lib/types";
import { SubmitButton } from "@/app/(app)/submit-button";
import { useToast } from "@/app/(app)/toast";
import { CurrencyInput } from "@/app/(app)/currency-input";
import { CategorySelect } from "@/app/(app)/category-select";
import { formatMoney, formatDate } from "@/lib/format";
import { FIELD_CLASS as fieldClass } from "@/lib/ui";

type DuplicateMatch = { id: string; description: string; amount: number; txn_date: string };

export function TransactionForm({
  periodId,
  accounts,
  categories,
}: {
  periodId: string;
  accounts: Account[];
  categories: Category[];
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"income" | "expense">("expense");
  const [categoryId, setCategoryId] = useState("");
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateMatch[] | null>(null);
  const [pendingFormData, setPendingFormData] = useState<FormData | null>(null);
  const [accountId, setAccountId] = useState("");
  const showToast = useToast();

  // Debt accounts (credit cards, loans) store the opposite of what you'd
  // naturally expect: a new charge is recorded as "income" (it increases
  // what's owed) and a payment as "expense" (it reduces what's owed). The
  // form always speaks in terms of "charge"/"payment" for these accounts
  // and flips the stored kind here instead of making the user remember it.
  const isDebtAccount = accounts.find((a) => a.id === accountId)?.is_debt ?? false;
  const effectiveKind = isDebtAccount ? (kind === "expense" ? "income" : "expense") : kind;

  async function handleDescriptionBlur(description: string) {
    if (kind !== "expense" || categoryTouched || !description.trim()) return;
    const suggestion = await suggestCategory(description);
    if (suggestion) setCategoryId(suggestion);
  }

  function resetForm() {
    setOpen(false);
    setCategoryId("");
    setCategoryTouched(false);
    setDuplicates(null);
    setPendingFormData(null);
    setAccountId("");
  }

  async function submitFormData(formData: FormData) {
    const result = await createTransaction(formData);
    if (!result.ok) {
      showToast(result.error ? `Couldn't save: ${result.error}` : "Couldn't save transaction");
      return;
    }
    resetForm();
    const label = isDebtAccount ? (kind === "expense" ? "Charge" : "Payment") : kind === "income" ? "Income" : "Expense";
    showToast(`${label} logged`);
  }

  async function handleSubmit(formData: FormData) {
    const account_id = String(formData.get("account_id") ?? "");
    const txn_date = String(formData.get("txn_date") ?? "");
    const amount = Number(formData.get("amount") ?? 0);

    if (account_id && amount && txn_date) {
      const matches = await checkDuplicateTransaction(account_id, amount, txn_date);
      if (matches.length > 0) {
        setDuplicates(matches);
        setPendingFormData(formData);
        return;
      }
    }

    await submitFormData(formData);
  }

  async function confirmAnyway() {
    if (!pendingFormData) return;
    await submitFormData(pendingFormData);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-text-muted transition-colors hover:bg-bg"
      >
        + Add transaction
      </button>
    );
  }

  return (
    <form
      action={handleSubmit}
      className="grid max-w-3xl grid-cols-1 gap-4 rounded-xl border border-border bg-surface p-5 shadow-card sm:grid-cols-3 sm:p-6"
    >
      <input type="hidden" name="period_id" value={periodId} />
      <input type="hidden" name="kind" value={effectiveKind} />

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-text">Type</label>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as "income" | "expense")}
          className={fieldClass}
        >
          <option value="expense">{isDebtAccount ? "Charge" : "Expense"}</option>
          <option value="income">{isDebtAccount ? "Payment" : "Income"}</option>
        </select>
      </div>

      <div className="space-y-1.5 sm:col-span-2">
        <label className="text-sm font-medium text-text">Description</label>
        <input
          name="description"
          required
          placeholder="Whole Foods"
          autoFocus
          onBlur={(e) => handleDescriptionBlur(e.target.value)}
          className={fieldClass}
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-text">Amount</label>
        <CurrencyInput name="amount" required className={`${fieldClass} pr-3 pl-6 text-right`} />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-text">Date</label>
        <input
          type="date"
          name="txn_date"
          required
          defaultValue={new Date().toISOString().slice(0, 10)}
          className={fieldClass}
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-text">Account</label>
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
        {isDebtAccount && (
          <p className="text-xs text-text-faint">
            This is a debt account — logged as a {kind === "expense" ? "charge" : "payment"}.
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-text">Category</label>
        <CategorySelect
          categories={categories}
          kind={kind}
          value={categoryId}
          onChange={(id) => {
            setCategoryId(id);
            setCategoryTouched(true);
          }}
          className={fieldClass}
        />
      </div>

      <div className="space-y-1.5 sm:col-span-3">
        <label className="text-sm font-medium text-text">Notes (optional)</label>
        <input
          name="notes"
          placeholder="Split with Mike, reimbursed by work…"
          maxLength={140}
          className={fieldClass}
        />
      </div>

      <div className="flex items-center gap-2 sm:col-span-3">
        <input
          type="checkbox"
          id="make-recurring-toggle"
          name="make_recurring"
          className="h-4 w-4 accent-[var(--accent)]"
        />
        <label htmlFor="make-recurring-toggle" className="text-sm text-text-muted">
          Make this recurring — automatically log it again every month
        </label>
      </div>

      {duplicates && duplicates.length > 0 && (
        <div className="space-y-2 rounded-lg border border-caution bg-caution-bg p-3 sm:col-span-3">
          <p className="text-sm font-medium text-caution-strong">
            This looks like it might already be logged:
          </p>
          <ul className="space-y-1 text-sm text-caution-strong">
            {duplicates.map((d) => (
              <li key={d.id}>
                {d.description} — {formatMoney(d.amount)} on {formatDate(d.txn_date)}
              </li>
            ))}
          </ul>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={confirmAnyway}
              className="rounded-md border border-caution px-3 py-1.5 text-xs font-semibold text-caution-strong hover:bg-caution-bg"
            >
              Add anyway
            </button>
            <button
              type="button"
              onClick={() => {
                setDuplicates(null);
                setPendingFormData(null);
              }}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-caution-strong hover:bg-caution-bg"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-2 sm:col-span-3">
        <SubmitButton pendingText="Saving…">Add transaction</SubmitButton>
        <button
          type="button"
          onClick={resetForm}
          className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-text-muted transition-colors hover:bg-bg"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
