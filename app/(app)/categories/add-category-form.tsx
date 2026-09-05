"use client";

import { useState } from "react";
import { createCategory } from "@/app/actions";

export function AddCategoryForm() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-text-muted transition-colors hover:bg-bg"
      >
        + Add category
      </button>
    );
  }

  return (
    <form
      action={(formData) => {
        createCategory(formData);
        setOpen(false);
      }}
      className="grid max-w-xl grid-cols-1 gap-4 rounded-xl border border-border bg-surface p-6 shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] sm:grid-cols-3"
    >
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-text">Name</label>
        <input
          name="name"
          required
          autoFocus
          placeholder="Groceries"
          className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition-colors focus:border-accent"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-text">Type</label>
        <select
          name="kind"
          className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition-colors focus:border-accent"
        >
          <option value="expense">Expense</option>
          <option value="income">Income</option>
        </select>
      </div>
      <div className="flex items-end gap-2 pb-2.5">
        <input type="checkbox" id="is_need" name="is_need" className="h-4 w-4 accent-[var(--accent)]" />
        <label htmlFor="is_need" className="text-sm text-text">Need (vs. want)</label>
      </div>
      <div className="flex gap-2 sm:col-span-3">
        <button
          type="submit"
          className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          Add category
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
