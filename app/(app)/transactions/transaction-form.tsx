"use client";

import { useState } from "react";
import { checkDuplicateTransaction, createTransaction, suggestCategory } from "@/app/actions";
import type { Account, Category } from "@/lib/types";
import { SubmitButton } from "@/app/(app)/submit-button";
import { useToast } from "@/app/(app)/toast";
import { formatMoney, formatDate } from "@/lib/format";

const fieldClass =
  "w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition-colors focus:border-accent";

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
  const filteredCategories = categories.filter((c) => c.kind === kind);
  const showToast = useToast();

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
  }

  async function submitFormData(formData: FormData) {
    await createTransaction(formData);
    resetForm();
    showToast(kind === "income" ? "Income logged" : "Expense logged");
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
      className="grid max-w-3xl grid-cols-1 gap-4 rounded-xl border border-border bg-surface p-6 shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] sm:grid-cols-3"
    >
      <input type="hidden" name="period_id" value={periodId} />

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-text">Type</label>
        <select
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as "income" | "expense")}
          className={fieldClass}
        >
          <option value="expense">Expense</option>
          <option value="income">Income</option>
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
        <input type="number" step="0.01" name="amount" required className={fieldClass} />
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
        <select name="account_id" className={fieldClass}>
          <option value="">—</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-text">Category</label>
        <select
          name="category_id"
          value={categoryId}
          onChange={(e) => {
            setCategoryId(e.target.value);
            setCategoryTouched(true);
          }}
          className={fieldClass}
        >
          <option value="">—</option>
          {filteredCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5 sm:col-span-3">
        <label className="text-sm font-medium text-text">Notes (optional)</label>
        <input name="notes" placeholder="Split with Mike, reimbursed by work…" className={fieldClass} />
      </div>

      {duplicates && duplicates.length > 0 && (
        <div className="space-y-2 rounded-lg border border-[#f79009] bg-[#fffaeb] p-3 sm:col-span-3">
          <p className="text-sm font-medium text-[#b54708]">
            This looks like it might already be logged:
          </p>
          <ul className="space-y-1 text-sm text-[#b54708]">
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
              className="rounded-md border border-[#f79009] px-3 py-1.5 text-xs font-semibold text-[#b54708] hover:bg-[#fef0c7]"
            >
              Add anyway
            </button>
            <button
              type="button"
              onClick={() => {
                setDuplicates(null);
                setPendingFormData(null);
              }}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-[#b54708] hover:bg-[#fef0c7]"
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
          className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-text-muted hover:bg-bg"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
