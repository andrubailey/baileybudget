import { getAccountsWithBalances } from "@/lib/queries";
import { createAccount } from "@/app/actions";
import { BANK_OPTIONS } from "@/lib/types";
import { AccountList } from "./account-list";

export default async function AccountsPage() {
  const accounts = await getAccountsWithBalances();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold">Accounts</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          Bank accounts, cards, or savings goals. Balance updates
          automatically from transactions.
        </p>
      </div>

      <form
        action={createAccount}
        className="grid max-w-2xl grid-cols-1 gap-4 rounded-xl border border-black/10 p-5 sm:grid-cols-4 dark:border-white/10"
      >
        <div className="space-y-1.5 sm:col-span-1">
          <label className="text-sm font-medium">Name</label>
          <input
            name="name"
            required
            placeholder="Checking"
            className="w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/15"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Bank</label>
          <input
            name="bank"
            list="bank-options"
            placeholder="Chase"
            className="w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/15"
          />
          <datalist id="bank-options">
            {BANK_OPTIONS.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Starting balance</label>
          <input
            type="number"
            step="0.01"
            name="starting_balance"
            defaultValue={0}
            className="w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/15"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Goal (optional)</label>
          <input
            type="number"
            step="0.01"
            name="goal"
            className="w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/15"
          />
        </div>
        <div className="sm:col-span-4">
          <button
            type="submit"
            className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
          >
            Add account
          </button>
        </div>
      </form>

      <p className="text-xs text-black/50 dark:text-white/50">
        Drag a card to reorder your accounts.
      </p>
      <AccountList accounts={accounts} bankOptions={BANK_OPTIONS} />
    </div>
  );
}
