"use client";

import { useState } from "react";
import { reconcileAccountBalance } from "@/app/actions";
import { Dropdown } from "@/app/(app)/dropdown";
import { accountChoices } from "@/app/(app)/dropdown-options";
import { CurrencyInput } from "@/app/(app)/currency-input";
import { useToast } from "@/app/(app)/toast";
import { formatMoney } from "@/lib/format";
import type { AccountWithBalance } from "@/lib/queries";

// The button that opens the reconcile flow — a fast "does this account
// actually match the bank" check for whenever a transaction slipped through
// without being logged, without having to hunt through the transactions
// list first to notice.
export function ReconcileButton({ accounts }: { accounts: AccountWithBalance[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-text-muted transition-colors hover:bg-bg"
      >
        Reconcile
      </button>
      {open && <ReconcileModal accounts={accounts} onClose={() => setOpen(false)} />}
    </>
  );
}

type Checked = { account: AccountWithBalance; entered: number };

function ReconcileModal({
  accounts,
  onClose,
}: {
  accounts: AccountWithBalance[];
  onClose: () => void;
}) {
  const [accountId, setAccountId] = useState("");
  const [checked, setChecked] = useState<Checked | null>(null);
  const [saving, setSaving] = useState(false);
  const showToast = useToast();

  function handleCheck(formData: FormData) {
    const account = accounts.find((a) => a.id === accountId);
    if (!account) return;
    const entered = Number(formData.get("balance") ?? 0);
    setChecked({ account, entered });
  }

  const diff = checked ? Math.round((checked.entered - checked.account.balance) * 100) / 100 : null;

  async function saveAdjustment() {
    if (!checked) return;
    setSaving(true);
    const result = await reconcileAccountBalance(checked.account.id, checked.entered);
    setSaving(false);
    if (!result.ok) {
      showToast(result.error ? `Couldn't save: ${result.error}` : "Couldn't update balance");
      return;
    }
    showToast("Balance updated");
    onClose();
  }

  // Hands the discrepancy off to the AI advisor with enough context to act
  // on immediately — the account, both figures, and which direction the gap
  // runs — so pasting in the bank's statement is the only thing left to do
  // before it can start looking for what's missing.
  function findDiscrepancy() {
    if (!checked || diff === null) return;
    const prompt = `I'm missing a transaction somewhere in ${checked.account.name}. The app shows a balance of ${formatMoney(checked.account.balance)}, but the account actually shows ${formatMoney(checked.entered)} — a difference of ${formatMoney(Math.abs(diff))} (${diff > 0 ? "the app is missing income or a deposit" : "the app is missing an expense or a charge"}). I'm going to paste in the bank statement for this account — find the transaction(s) that account for the difference and log whatever's missing.`;
    window.dispatchEvent(new CustomEvent("budgetapp:open-chat", { detail: { prompt } }));
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
        aria-label="Reconcile a balance"
        className="animate-modal-panel w-full max-w-md rounded-xl border border-border bg-surface shadow-modal"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold text-text">Reconcile a balance</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2.5 flex size-11 shrink-0 items-center justify-center rounded-lg text-text-faint transition-colors hover:bg-bg hover:text-text"
          >
            ✕
          </button>
        </div>

        {!checked ? (
          <form action={handleCheck} className="space-y-4 p-5">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text">Which account are you checking?</label>
              <Dropdown
                value={accountId}
                onChange={setAccountId}
                placeholder="Choose an account"
                options={accountChoices(accounts, "Choose an account")}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text">What the account shows right now</label>
              <CurrencyInput name="balance" required autoFocus />
            </div>
            <button
              type="submit"
              disabled={!accountId}
              className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Check balance
            </button>
          </form>
        ) : (
          <div className="space-y-4 p-5">
            <div className="rounded-xl border border-border bg-bg px-5 py-4 text-center">
              <p className="text-xs text-text-faint">{checked.account.name}</p>
              {diff === 0 ? (
                <p className="mt-1 text-lg font-semibold text-positive">Balances match</p>
              ) : (
                <>
                  <p
                    className={`tabular mt-1 text-2xl font-semibold ${
                      diff! > 0 ? "text-positive" : "text-negative"
                    }`}
                  >
                    {diff! > 0 ? "+" : "-"}
                    {formatMoney(Math.abs(diff!))}
                  </p>
                  <p className="tabular mt-1 text-xs text-text-faint">
                    App shows {formatMoney(checked.account.balance)} · You entered{" "}
                    {formatMoney(checked.entered)}
                  </p>
                </>
              )}
            </div>

            {diff !== 0 && (
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={findDiscrepancy}
                  className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                >
                  Find the discrepancy
                </button>
                <button
                  type="button"
                  onClick={saveAdjustment}
                  disabled={saving}
                  className="w-full rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-text transition-colors hover:bg-bg disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Just fix the balance"}
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => setChecked(null)}
              className="w-full text-center text-xs font-medium text-text-faint transition-colors hover:text-text"
            >
              Check a different account
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
