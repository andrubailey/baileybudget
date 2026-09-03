"use client";

import { useState } from "react";
import { createTransaction } from "@/app/actions";
import { TAG_OPTIONS } from "@/lib/types";
import type { Account, Category } from "@/lib/types";

const fieldClass =
  "w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition-colors focus:border-accent";

const ICONS = {
  income: (
    <path d="M12 5v14M5 12h14" stroke="#17b26a" strokeWidth={2} strokeLinecap="round" />
  ),
  expense: <path d="M5 12h14" stroke="#f04438" strokeWidth={2} strokeLinecap="round" />,
};

const CONFIG = {
  income: {
    bg: "#dcfae6",
    title: "Add income",
    subtitle: "Log an income transaction",
  },
  expense: {
    bg: "#fee4e2",
    title: "Add expense",
    subtitle: "Log an expense transaction",
  },
} as const;

export function QuickAddButton({
  kind,
  periodId,
  accounts,
  categories,
}: {
  kind: "income" | "expense";
  periodId: string;
  accounts: Account[];
  categories: Category[];
}) {
  const [open, setOpen] = useState(false);
  const { bg, title, subtitle } = CONFIG[kind];
  const kindCategories = categories.filter((c) => c.kind === kind);

  async function handleSubmit(formData: FormData) {
    await createTransaction(formData);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-start gap-3 rounded-xl border border-border bg-surface p-5 text-left shadow-[0px_1px_1px_0px_rgba(16,24,40,0.05)] transition-shadow hover:shadow-md"
      >
        <span
          className="flex size-12 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: bg }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            {ICONS[kind]}
          </svg>
        </span>
        <div>
          <p className="text-base font-semibold text-text-2">{title}</p>
          <p className="text-sm text-text-muted">{subtitle}</p>
        </div>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-xl border border-border bg-surface p-6 shadow-xl"
          >
            <div className="mb-4 flex items-start justify-between">
              <h2 className="text-lg font-semibold text-text">{title}</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-text-faint hover:text-text"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <form action={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <input type="hidden" name="period_id" value={periodId} />
              <input type="hidden" name="kind" value={kind} />

              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-sm font-medium text-text">Description</label>
                <input
                  name="description"
                  required
                  placeholder={kind === "income" ? "Paycheck" : "Whole Foods"}
                  autoFocus
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
                <select name="category_id" className={fieldClass}>
                  <option value="">—</option>
                  {kindCategories.map((c) => (
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

              <div className="flex items-center gap-3 sm:col-span-2">
                <button
                  type="submit"
                  className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                >
                  {kind === "income" ? "Add income" : "Add expense"}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-text-muted hover:bg-bg"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
