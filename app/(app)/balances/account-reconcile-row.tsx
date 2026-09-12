"use client";

import { useState, useTransition } from "react";
import { reconcileAccountBalance } from "@/app/actions";
import { formatMoney } from "@/lib/format";
import { CurrencyInput } from "@/app/(app)/currency-input";
import { Money } from "@/app/(app)/money";
import { useToast } from "@/app/(app)/toast";
import type { AccountWithBalance } from "@/lib/queries";

// A fast way to correct a stale balance right there — no drawer, no
// navigating to account settings. Tapping the balance swaps it for an
// editable field, pre-filled with what the app currently computes, so
// confirming a balance that's already right is just "tap, see it's
// correct, tap the check" — same number of taps as fixing a wrong one.
export function AccountReconcileRow({
  account: a,
  index = 0,
}: {
  account: AccountWithBalance;
  index?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const showToast = useToast();

  // CurrencyInput only exposes what was typed through a hidden form field
  // (it's built for form submission, not as a controlled value) — so saving
  // reads it via FormData off the form's own submit rather than tracking a
  // parallel bit of React state that would just go stale as the input's
  // internal sanitizing logic reformats what's typed.
  function save(formData: FormData) {
    const entered = Number(formData.get("balance") ?? 0);
    startTransition(async () => {
      const result = await reconcileAccountBalance(a.id, entered);
      if (!result.ok) {
        showToast(result.error ? `Couldn't save: ${result.error}` : "Couldn't update balance");
        return;
      }
      const diff = Math.round((entered - a.balance) * 100) / 100;
      showToast(diff === 0 ? "Balance confirmed" : `Balance updated to ${formatMoney(entered)}`);
      setEditing(false);
    });
  }

  return (
    <div
      style={{ animationDelay: `${index * 12}ms` }}
      className="animate-fade-in-up flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-text">{a.name}</p>
      </div>

      {editing ? (
        <form action={save} className="flex shrink-0 items-center gap-1.5">
          <CurrencyInput
            name="balance"
            defaultValue={a.balance}
            autoFocus
            dollarPosition="left-2"
            className="tabular no-spinner w-28 rounded-md border border-border bg-bg py-1.5 pr-2 pl-6 text-right text-sm text-text outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={isPending}
            aria-label="Save balance"
            className="-m-1 flex size-9 shrink-0 items-center justify-center rounded-full text-positive-strong transition-colors hover:bg-positive-bg disabled:opacity-60"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            aria-label="Cancel"
            className="-m-1 flex size-9 shrink-0 items-center justify-center rounded-full text-text-faint transition-colors hover:bg-bg"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
            </svg>
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="-m-2 flex shrink-0 items-center gap-1.5 rounded-lg p-2 text-right transition-colors hover:bg-bg"
        >
          <Money
            amount={a.balance}
            tone={a.is_debt ? "negative" : undefined}
            className="tabular text-sm font-semibold text-text"
          />
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className="shrink-0 text-text-faint">
            <path
              d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Z"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
