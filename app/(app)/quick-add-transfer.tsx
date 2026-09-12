"use client";

import { DatePicker } from "@/app/(app)/date-picker";

import { Dropdown } from "@/app/(app)/dropdown";
import { accountChoices } from "@/app/(app)/dropdown-options";

import { useState } from "react";
import { createTransfer } from "@/app/actions";
import type { Account } from "@/lib/types";
import { SubmitButton } from "@/app/(app)/submit-button";
import { useToast } from "@/app/(app)/toast";
import {
  announcePendingTransaction,
  withdrawPendingTransaction,
} from "@/app/(app)/pending-transactions";
import { FIELD_CLASS as fieldClass } from "@/lib/ui";

// Keeps the default date inside the period this transfer is being filed
// under — see the identical helper in quick-add.tsx for why.
function clampToPeriod(iso: string, min?: string | null, max?: string | null): string {
  if (min && iso < min) return min;
  if (max && iso > max) return max;
  return iso;
}

export function QuickAddTransferButton({
  periodId,
  periodStart,
  periodEnd,
  accounts,
  renderTrigger,
}: {
  periodId: string;
  periodStart?: string | null;
  periodEnd?: string | null;
  accounts: Account[];
  renderTrigger?: (open: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const showToast = useToast();

  async function handleSubmit(formData: FormData) {
    const fromId = String(formData.get("from_account_id") ?? "") || null;
    const toId = String(formData.get("to_account_id") ?? "") || null;
    const pendingId = announcePendingTransaction({
      kind: "transfer",
      description: "Transfer",
      amount: Number(formData.get("amount") ?? 0),
      txn_date: String(formData.get("txn_date") ?? new Date().toISOString().slice(0, 10)),
      account_id: fromId,
      to_account_id: toId,
      category_id: null,
      period_id: periodId,
      notes: String(formData.get("notes") ?? "").trim() || null,
    });
    const result = await createTransfer(formData);
    if (!result.ok) {
      withdrawPendingTransaction(pendingId);
      showToast(result.error ? `Couldn't save: ${result.error}` : "Couldn't save transfer");
      return;
    }
    setOpen(false);
    showToast("Transfer logged");
  }

  return (
    <>
      {renderTrigger ? (
        renderTrigger(() => setOpen(true))
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="card-hover flex items-start gap-3 rounded-xl border border-border bg-surface p-5 text-left shadow-card"
        >
          <span
            className="flex size-12 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: "var(--transfer-bg)" }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path
                d="M7 7h11l-3-3M17 17H6l3 3"
                stroke="var(--transfer)"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <div>
            <p className="text-base font-semibold text-text-2">Add transfer</p>
            <p className="text-sm text-text-muted">Move money between accounts</p>
          </div>
        </button>
      )}

      {open && (
        <div
          className="animate-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            // dvh (not vh) so this actually shrinks when the on-screen
            // keyboard opens — vh stays pinned to the full, un-keyboarded
            // screen height on iOS Safari, which let this panel keep
            // centering/sizing itself against space that wasn't visible
            // anymore and pushed the Save button below the keyboard.
            className="animate-modal-panel max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-surface shadow-modal"
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="text-lg font-semibold text-text">Add transfer</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="-mr-2.5 flex size-11 shrink-0 items-center justify-center rounded-lg text-text-faint transition-colors hover:bg-bg hover:text-text"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <form action={handleSubmit} className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
              <input type="hidden" name="period_id" value={periodId} />

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text">Amount</label>
                <input
                  type="number"
                  step="0.01"
                  name="amount"
                  required
                  autoFocus
                  className={fieldClass}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text">Date</label>
                <DatePicker
                  name="txn_date"
                  required
                  defaultValue={clampToPeriod(new Date().toISOString().slice(0, 10), periodStart, periodEnd)}
                  min={periodStart ?? undefined}
                  max={periodEnd ?? undefined}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text">From account</label>
                <Dropdown
                  name="from_account_id"
                  required
                  placeholder="—"
                  options={accountChoices(accounts)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text">To account</label>
                <Dropdown
                  name="to_account_id"
                  required
                  placeholder="—"
                  options={accountChoices(accounts)}
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-sm font-medium text-text">Notes (optional)</label>
                <textarea
                  name="notes"
                  rows={2}
                  maxLength={500}
                  placeholder="Add a note…"
                  className={fieldClass}
                />
              </div>

              {/* Sticky, not just the last grid item — stays reachable at
                  the bottom of the scrollable panel instead of scrolling
                  away under the keyboard along with the rest of the form. */}
              <div className="sticky bottom-0 -mx-5 -mb-5 flex items-center gap-3 border-t border-border bg-surface px-5 py-4 sm:col-span-2">
                <SubmitButton pendingText="Saving…">Add transfer</SubmitButton>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-text-muted transition-colors hover:bg-bg"
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
