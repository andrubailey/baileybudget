"use client";

import { useState } from "react";
import { createBalanceAdjustment } from "@/app/actions";
import { formatMoney } from "@/lib/format";
import type { AccountWithBalance } from "@/lib/queries";
import { FIELD_CLASS } from "@/lib/ui";
import { Money } from "@/app/(app)/money";
import { useToast } from "@/app/(app)/toast";

// "Bank says X, app says Y, difference Z" — with one button that posts an
// adjustment for Z so the two agree. What used to be a pasted list of
// balances and a hunt for the missing entry becomes a thirty-second pass
// down the account cards.
export function ReconcileButton({ account }: { account: AccountWithBalance }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className="inline-flex items-center gap-1 text-xs font-medium text-text-muted transition-colors hover:text-text"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Reconcile
      </button>
      {open && <ReconcileModal account={account} onClose={() => setOpen(false)} />}
    </>
  );
}

function ReconcileModal({
  account: a,
  onClose,
}: {
  account: AccountWithBalance;
  onClose: () => void;
}) {
  const [bankInput, setBankInput] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState(false);
  const showToast = useToast();

  const bank = bankInput.trim() === "" ? null : Number(bankInput.replace(/[$,]/g, ""));
  const valid = bank !== null && Number.isFinite(bank);
  const difference = valid ? Math.round((bank - a.balance) * 100) / 100 : null;
  const matches = difference === 0;

  function close() {
    setClosing(true);
    setTimeout(onClose, 120);
  }

  async function handleAdjust() {
    if (!valid || difference === null || difference === 0) return;
    setBusy(true);
    const result = await createBalanceAdjustment({
      accountId: a.id,
      bankBalance: bank!,
      appBalance: a.balance,
      note: note || null,
    });
    setBusy(false);
    if (!result.ok) {
      showToast(result.error ? `Couldn't reconcile: ${result.error}` : "Couldn't reconcile");
      return;
    }
    showToast(`${a.name} reconciled — ${formatMoney(Math.abs(difference))} adjustment logged`);
    close();
  }

  // For a debt account, "balance" is what's owed, so the wording flips:
  // a bank figure above ours means more was charged than we logged.
  const explanation =
    difference === null || difference === 0
      ? null
      : a.is_debt
        ? difference > 0
          ? `The bank shows ${formatMoney(difference)} more owed than the app. Logging this as a charge will match them.`
          : `The bank shows ${formatMoney(-difference)} less owed than the app. Logging this as a payment will match them.`
        : difference > 0
          ? `The bank has ${formatMoney(difference)} more than the app knows about. Logging it as income will match them.`
          : `The app has ${formatMoney(-difference)} more than the bank. Logging it as an expense will match them.`;

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 ${
        closing ? "animate-modal-backdrop-out" : "animate-modal-backdrop"
      }`}
      onClick={(e) => {
        e.stopPropagation();
        close();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-md overflow-hidden rounded-xl border border-border bg-surface shadow-modal ${
          closing ? "animate-modal-panel-out" : "animate-modal-panel"
        }`}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-text">Reconcile {a.name}</h2>
            <p className="text-xs text-text-muted">Enter the balance your bank shows right now.</p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="-mr-1.5 flex size-9 shrink-0 items-center justify-center rounded-lg text-text-faint transition-colors hover:bg-bg hover:text-text"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-bg p-3">
              <p className="text-metadata">App says</p>
              <Money
                amount={a.balance}
                className="mt-1 block text-lg font-semibold text-text"
                tone={a.is_debt ? "negative" : undefined}
              />
            </div>
            <div className="rounded-lg bg-bg p-3">
              <p className="text-metadata">Bank says</p>
              <input
                autoFocus
                inputMode="decimal"
                placeholder="0.00"
                value={bankInput}
                onChange={(e) => setBankInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAdjust();
                }}
                className={`${FIELD_CLASS} mt-1 text-lg font-semibold`}
              />
            </div>
          </div>

          {valid && (
            <div
              className={`rounded-lg border px-3 py-2.5 text-sm ${
                matches
                  ? "border-positive-border bg-positive-bg text-positive-strong"
                  : "border-caution-border bg-caution-bg text-caution-strong"
              }`}
            >
              {matches ? (
                "Balances match. Nothing to adjust."
              ) : (
                <>
                  <p className="font-semibold">
                    Difference: <Money amount={difference!} signDisplay="auto" />
                  </p>
                  <p className="mt-0.5 text-xs opacity-90">{explanation}</p>
                </>
              )}
            </div>
          )}

          {valid && !matches && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-text-muted">Note (optional)</label>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. missed a cash withdrawal"
                maxLength={140}
                className={FIELD_CLASS}
              />
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={close}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-bg"
            >
              {matches ? "Done" : "Cancel"}
            </button>
            {!matches && (
              <button
                type="button"
                onClick={handleAdjust}
                disabled={!valid || busy}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "Saving…" : "Log adjustment"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
