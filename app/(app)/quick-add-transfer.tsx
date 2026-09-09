"use client";

import { useState } from "react";
import { createTransfer } from "@/app/actions";
import type { Account } from "@/lib/types";
import { SubmitButton } from "@/app/(app)/submit-button";
import { useToast } from "@/app/(app)/toast";
import { FIELD_CLASS as fieldClass } from "@/lib/ui";

export function QuickAddTransferButton({
  periodId,
  accounts,
  renderTrigger,
}: {
  periodId: string;
  accounts: Account[];
  renderTrigger?: (open: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const showToast = useToast();

  async function handleSubmit(formData: FormData) {
    const result = await createTransfer(formData);
    if (!result.ok) {
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
            className="animate-modal-panel max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-surface p-6 shadow-modal"
          >
            <div className="mb-4 flex items-start justify-between">
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

            <form action={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                <input
                  type="date"
                  name="txn_date"
                  required
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  className={fieldClass}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text">From account</label>
                <select name="from_account_id" required className={fieldClass}>
                  <option value="">—</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text">To account</label>
                <select name="to_account_id" required className={fieldClass}>
                  <option value="">—</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
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

              <div className="flex items-center gap-3 sm:col-span-2">
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
