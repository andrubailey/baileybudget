"use client";

import { useState } from "react";
import { createTransaction } from "@/app/actions";
import { TAG_OPTIONS } from "@/lib/types";
import type { Account, Category } from "@/lib/types";

const fieldClass =
  "w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition-colors focus:border-accent";

export function TransactionForm({
  periodId,
  accounts,
  categories,
}: {
  periodId: string;
  accounts: Account[];
  categories: Category[];
}) {
  const [kind, setKind] = useState<"income" | "expense">("expense");
  const filteredCategories = categories.filter((c) => c.kind === kind);

  return (
    <form
      action={createTransaction}
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
        <input name="description" required placeholder="Whole Foods" className={fieldClass} />
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
        <select name="category_id" className={fieldClass}>
          <option value="">—</option>
          {filteredCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5 sm:col-span-2">
        <label className="text-sm font-medium text-text">Tags</label>
        <div className="flex flex-wrap gap-3 pt-1">
          {TAG_OPTIONS.map((tag) => (
            <label key={tag} className="flex items-center gap-1.5 text-sm text-text-muted">
              <input
                type="checkbox"
                name="tags"
                value={tag}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              {tag}
            </label>
          ))}
        </div>
      </div>

      <div className="sm:col-span-3">
        <button
          type="submit"
          className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          Add transaction
        </button>
      </div>
    </form>
  );
}
