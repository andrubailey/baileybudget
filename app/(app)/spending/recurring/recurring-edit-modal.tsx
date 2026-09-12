"use client";

import { useState } from "react";
import { updateRecurringTransaction } from "@/app/actions";
import { CurrencyInput } from "@/app/(app)/currency-input";
import { Dropdown } from "@/app/(app)/dropdown";
import { accountChoices, categoryChoices } from "@/app/(app)/dropdown-options";
import { FieldError } from "@/app/(app)/field-error";
import { PanelField } from "@/app/(app)/panel-field";
import { SubmitButton } from "@/app/(app)/submit-button";
import { useToast } from "@/app/(app)/toast";
import { PANEL_FIELD_INPUT_CLASS } from "@/lib/ui";
import type { Account, Category, RecurringTransaction } from "@/lib/types";

// Edits a recurring rule's own details — right-clicked open from the
// Recurring page's row. Only what the rule itself controls (description,
// amount, which day it posts, account/category) — kind stays fixed, since
// flipping income/expense would strand the category picked below it (a
// category is one kind or the other).
export function RecurringEditModal({
  rule,
  accounts,
  categories,
  onClose,
  onSaved,
}: {
  rule: RecurringTransaction;
  accounts: Account[];
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [accountId, setAccountId] = useState(rule.account_id ?? "");
  const [categoryId, setCategoryId] = useState(rule.category_id ?? "");
  const [error, setError] = useState<string | null>(null);
  const showToast = useToast();
  const kindCategories = categories.filter((c) => c.kind === rule.kind);

  async function handleSubmit(formData: FormData) {
    setError(null);
    const description = String(formData.get("description") ?? "");
    const amount = Number(formData.get("amount") ?? 0);
    const day_of_month = Number(formData.get("day_of_month") ?? 0);
    const result = await updateRecurringTransaction(rule.id, {
      description,
      amount,
      day_of_month,
      account_id: accountId || null,
      category_id: categoryId || null,
    });
    if (!result.ok) {
      setError(result.error ?? "Couldn't save.");
      return;
    }
    showToast("Recurring bill updated");
    onSaved();
  }

  return (
    <div
      className="animate-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Edit recurring bill"
        className="animate-modal-panel flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-modal"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold text-text">Edit recurring {rule.kind === "income" ? "income" : "bill"}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2.5 flex size-11 shrink-0 items-center justify-center rounded-lg text-text-faint transition-colors hover:bg-bg hover:text-text"
          >
            ✕
          </button>
        </div>

        <form action={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
            <PanelField label="Description">
              <input
                name="description"
                required
                autoFocus
                defaultValue={rule.description}
                className={PANEL_FIELD_INPUT_CLASS}
              />
            </PanelField>

            <div className="grid grid-cols-2 gap-3">
              <PanelField label="Amount">
                <CurrencyInput
                  name="amount"
                  required
                  defaultValue={rule.amount}
                  dollarPosition="left-0"
                  className={`${PANEL_FIELD_INPUT_CLASS} pl-4`}
                />
              </PanelField>
              <PanelField label="Day of month">
                <input
                  type="number"
                  name="day_of_month"
                  min={1}
                  max={31}
                  step={1}
                  required
                  defaultValue={rule.day_of_month}
                  className={`${PANEL_FIELD_INPUT_CLASS} no-spinner`}
                />
              </PanelField>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text">Account</label>
              <Dropdown
                value={accountId}
                onChange={setAccountId}
                placeholder="—"
                options={accountChoices(accounts, "—")}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text">Category</label>
              <Dropdown
                value={categoryId}
                onChange={setCategoryId}
                placeholder="—"
                options={categoryChoices(kindCategories, "—")}
              />
            </div>

            <FieldError error={error} />
          </div>

          <div className="flex shrink-0 items-center gap-3 border-t border-border p-4">
            <SubmitButton pendingText="Saving…">Save</SubmitButton>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-text-muted transition-colors hover:bg-bg"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
