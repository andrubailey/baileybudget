"use client";

import { useState } from "react";
import { createTransaction } from "@/app/actions";
import { TAG_OPTIONS } from "@/lib/types";
import type { Account, Category } from "@/lib/types";

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
      className="grid max-w-3xl grid-cols-1 gap-4 rounded-xl border border-black/10 p-5 sm:grid-cols-3 dark:border-white/10"
    >
      <input type="hidden" name="period_id" value={periodId} />

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Type</label>
        <select
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as "income" | "expense")}
          className="w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/15"
        >
          <option value="expense">Expense</option>
          <option value="income">Income</option>
        </select>
      </div>

      <div className="space-y-1.5 sm:col-span-2">
        <label className="text-sm font-medium">Description</label>
        <input
          name="description"
          required
          placeholder="Whole Foods"
          className="w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/15"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Amount</label>
        <input
          type="number"
          step="0.01"
          name="amount"
          required
          className="w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/15"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Date</label>
        <input
          type="date"
          name="txn_date"
          required
          defaultValue={new Date().toISOString().slice(0, 10)}
          className="w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/15"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Account</label>
        <select
          name="account_id"
          className="w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/15"
        >
          <option value="">—</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Category</label>
        <select
          name="category_id"
          className="w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/15"
        >
          <option value="">—</option>
          {filteredCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5 sm:col-span-2">
        <label className="text-sm font-medium">Tags</label>
        <div className="flex flex-wrap gap-3 pt-1">
          {TAG_OPTIONS.map((tag) => (
            <label key={tag} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" name="tags" value={tag} className="h-4 w-4" />
              {tag}
            </label>
          ))}
        </div>
      </div>

      <div className="sm:col-span-3">
        <button
          type="submit"
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          Add transaction
        </button>
      </div>
    </form>
  );
}
