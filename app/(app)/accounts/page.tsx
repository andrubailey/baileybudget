import { getAccountsWithBalances } from "@/lib/queries";
import { createAccount } from "@/app/actions";
import { BANK_OPTIONS } from "@/lib/types";
import { AccountList } from "./account-list";

export default async function AccountsPage() {
  const accounts = await getAccountsWithBalances();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-text">Accounts</h1>
        <p className="mt-1 text-sm text-text-muted">
          Bank accounts, cards, or savings goals. Balance updates
          automatically from transactions.
        </p>
      </div>

      <form
        action={createAccount}
        className="grid max-w-2xl grid-cols-1 gap-4 rounded-xl border border-border bg-surface p-6 shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] sm:grid-cols-4"
      >
        <div className="space-y-1.5 sm:col-span-1">
          <label className="text-sm font-medium text-text">Name</label>
          <input
            name="name"
            required
            placeholder="Checking"
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition-colors focus:border-accent"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-text">Bank</label>
          <input
            name="bank"
            list="bank-options"
            placeholder="Chase"
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition-colors focus:border-accent"
          />
          <datalist id="bank-options">
            {BANK_OPTIONS.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-text">Starting balance</label>
          <input
            type="number"
            step="0.01"
            name="starting_balance"
            defaultValue={0}
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition-colors focus:border-accent"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-text">Goal (optional)</label>
          <input
            type="number"
            step="0.01"
            name="goal"
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition-colors focus:border-accent"
          />
        </div>
        <div className="sm:col-span-4">
          <button
            type="submit"
            className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Add account
          </button>
        </div>
      </form>

      <p className="text-xs text-text-faint">Drag a card to reorder your accounts.</p>
      <AccountList accounts={accounts} bankOptions={BANK_OPTIONS} />
    </div>
  );
}
