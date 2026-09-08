"use client";

import { useState } from "react";
import { createAccount } from "@/app/actions";
import { ACCOUNT_TYPE_LABELS, ACCOUNT_TYPES, BANK_OPTIONS } from "@/lib/types";
import { FIELD_CLASS as fieldClass } from "@/lib/ui";

export function AddAccountForm() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-text-muted transition-colors hover:bg-bg"
      >
        + Add account
      </button>
    );
  }

  return (
    <form
      action={(formData) => {
        createAccount(formData);
        setOpen(false);
      }}
      className="grid max-w-2xl grid-cols-1 gap-4 rounded-xl border border-border bg-surface p-5 shadow-card sm:grid-cols-4 sm:p-6"
    >
      <div className="space-y-1.5 sm:col-span-1">
        <label className="text-sm font-medium text-text">Name</label>
        <input name="name" required placeholder="Checking" className={fieldClass} />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-text">Bank</label>
        <select name="bank" defaultValue="" className={fieldClass}>
          <option value="">No bank</option>
          {BANK_OPTIONS.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-text">Starting balance</label>
        <input
          type="number"
          step="0.01"
          name="starting_balance"
          defaultValue={0}
          className={fieldClass}
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-text">Goal (optional)</label>
        <input type="number" step="0.01" name="goal" className={fieldClass} />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-text">Account type (optional)</label>
        <select name="account_type" defaultValue="" className={fieldClass}>
          <option value="">Unspecified</option>
          {ACCOUNT_TYPES.map((t) => (
            <option key={t} value={t}>
              {ACCOUNT_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-2 self-end pb-2.5 text-sm text-text sm:col-span-1">
        <input type="checkbox" name="is_business" className="h-4 w-4 accent-[var(--accent)]" />
        Business account
      </label>
      <div className="flex gap-2 sm:col-span-4">
        <button
          type="submit"
          className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          Add account
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
