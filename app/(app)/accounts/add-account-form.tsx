"use client";

import { Dropdown } from "@/app/(app)/dropdown";
import { accountTypeChoices, bankChoices } from "@/app/(app)/dropdown-options";
import { ToggleSwitch } from "@/app/(app)/toggle-switch";

import { useState } from "react";
import { createAccount } from "@/app/actions";
import { BANK_OPTIONS } from "@/lib/types";
import { FIELD_CLASS as fieldClass } from "@/lib/ui";

export function AddAccountForm() {
  const [open, setOpen] = useState(false);
  const [isBusiness, setIsBusiness] = useState(false);

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
        <Dropdown
          name="bank"
          defaultValue=""
          options={bankChoices(BANK_OPTIONS, "No bank")}
        />
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
        <Dropdown
          name="account_type"
          defaultValue=""
          options={accountTypeChoices("Unspecified")}
        />
      </div>
      <div className="flex items-center justify-between gap-2 self-end pb-2.5 sm:col-span-1">
        <span className="text-sm text-text">Business account</span>
        <input type="hidden" name="is_business" value={isBusiness ? "on" : ""} />
        <ToggleSwitch checked={isBusiness} onChange={setIsBusiness} label="Business account" />
      </div>
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
