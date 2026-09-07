"use client";

import { useState } from "react";
import { createRecurringTransaction } from "@/app/actions";
import type { Account, Category } from "@/lib/types";

export function AddRecurringForm({
  accounts,
  categories,
}: {
  accounts: Account[];
  categories: Category[];
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"income" | "expense">("expense");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-text-muted transition-colors hover:bg-bg"
      >
        + Add recurring transaction
      </button>
    );
  }

  const filteredCategories = categories.filter((c) => c.kind === kind);

  return (
    <form
      action={(formData) => {
        createRecurringTransaction(formData);
        setOpen(false);
      }}
      className="grid max-w-3xl grid-cols-1 gap-4 rounded-xl border border-border bg-surface p-6 shadow-card sm:grid-cols-3"
    >
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-text">Type</label>
        <select
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as "income" | "expense")}
          className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition-colors focus:border-accent"
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
          autoFocus
          placeholder="Rent, Netflix, Paycheck..."
          className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition-colors focus:border-accent"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-text">Amount</label>
        <input
          type="number"
          step="0.01"
          name="amount"
          required
          inputMode="decimal"
          className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition-colors focus:border-accent"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-text">Day of month</label>
        <input
          type="number"
          name="day_of_month"
          min={1}
          max={28}
          defaultValue={1}
          required
          className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition-colors focus:border-accent"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-text">Account</label>
        <select
          name="account_id"
          className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition-colors focus:border-accent"
        >
          <option value="">None</option>
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
          className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition-colors focus:border-accent"
        >
          <option value="">None</option>
          {filteredCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-2 sm:col-span-3">
        <button
          type="submit"
          className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          Add recurring transaction
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-text-muted hover:bg-bg"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
