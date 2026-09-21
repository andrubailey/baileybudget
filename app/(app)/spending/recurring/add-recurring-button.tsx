"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createRecurringTransaction } from "@/app/actions";
import { CurrencyInput } from "@/app/(app)/currency-input";
import { Dropdown } from "@/app/(app)/dropdown";
import { accountChoices, categoryChoices } from "@/app/(app)/dropdown-options";
import { FieldError } from "@/app/(app)/field-error";
import { PanelField } from "@/app/(app)/panel-field";
import { SubmitButton } from "@/app/(app)/submit-button";
import { useToast } from "@/app/(app)/toast";
import { PANEL_FIELD_INPUT_CLASS } from "@/lib/ui";
import type { Account, Category } from "@/lib/types";

export function AddRecurringButton({
  accounts,
  categories,
}: {
  accounts: Account[];
  categories: Category[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-text-muted transition-colors hover:bg-bg"
      >
        + Add recurring
      </button>
      {open && (
        <AddRecurringModal
          accounts={accounts.filter((a) => a.is_active)}
          categories={categories.filter((c) => c.is_active)}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function AddRecurringModal({
  accounts,
  categories,
  onClose,
}: {
  accounts: Account[];
  categories: Category[];
  onClose: () => void;
}) {
  const router = useRouter();
  const showToast = useToast();
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const kindCategories = categories.filter((c) => c.kind === kind);

  async function handleSubmit(formData: FormData) {
    setError(null);
    const result = await createRecurringTransaction({
      kind,
      description: String(formData.get("description") ?? ""),
      amount: Number(formData.get("amount") ?? 0),
      day_of_month: Number(formData.get("day_of_month") ?? 0),
      account_id: accountId || null,
      category_id: categoryId || null,
    });
    if (!result.ok) {
      setError(result.error ?? "Couldn't save.");
      return;
    }
    showToast(kind === "income" ? "Recurring income added" : "Recurring bill added");
    router.refresh();
    onClose();
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
        aria-label="Add recurring transaction"
        className="animate-modal-panel flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-modal"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold text-text">Add recurring</h2>
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
            <div role="tablist" className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-bg p-1">
              {(["expense", "income"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={kind === k}
                  onClick={() => {
                    setKind(k);
                    setCategoryId("");
                  }}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    kind === k ? "bg-surface text-text shadow-card" : "text-text-muted hover:text-text"
                  }`}
                >
                  {k === "expense" ? "Bill / expense" : "Income"}
                </button>
              ))}
            </div>

            <PanelField label="Description">
              <input
                name="description"
                required
                autoFocus
                placeholder={kind === "income" ? "Paycheck" : "Rent, Netflix, Insurance…"}
                className={PANEL_FIELD_INPUT_CLASS}
              />
            </PanelField>

            <div className="grid grid-cols-2 gap-3">
              <PanelField label="Amount">
                <CurrencyInput
                  name="amount"
                  required
                  dollarPosition="left-0"
                  className={`${PANEL_FIELD_INPUT_CLASS} pl-4`}
                />
              </PanelField>
              <PanelField label="Day of month">
                <input
                  type="number"
                  name="day_of_month"
                  min={1}
                  max={28}
                  step={1}
                  required
                  placeholder="1–28"
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
            <SubmitButton pendingText="Adding…">Add</SubmitButton>
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
