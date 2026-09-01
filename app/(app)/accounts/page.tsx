import { getAccountsWithBalances } from "@/lib/queries";
import { createAccount, toggleAccountActive } from "@/app/actions";
import { formatMoney } from "@/lib/format";

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
        className="grid max-w-xl grid-cols-1 gap-4 rounded-xl border border-black/10 p-5 sm:grid-cols-3 dark:border-white/10"
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
        <div className="sm:col-span-3">
          <button
            type="submit"
            className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
          >
            Add account
          </button>
        </div>
      </form>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {accounts.map((a) => {
          const progress =
            a.goal && a.goal > 0
              ? Math.min(100, Math.max(0, (a.balance / a.goal) * 100))
              : null;
          return (
            <div
              key={a.id}
              className="rounded-xl border border-black/10 p-5 dark:border-white/10"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium">{a.name}</p>
                  <p className="mt-1 text-2xl font-semibold">
                    {formatMoney(a.balance)}
                  </p>
                </div>
                <form
                  action={toggleAccountActive.bind(null, a.id, !a.is_active)}
                >
                  <button
                    type="submit"
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      a.is_active
                        ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
                        : "bg-black/10 text-black/50 dark:bg-white/10 dark:text-white/50"
                    }`}
                  >
                    {a.is_active ? "Active" : "Deactivated"}
                  </button>
                </form>
              </div>

              {a.goal && a.goal > 0 && (
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-black/50 dark:text-white/50">
                    <span>Goal {formatMoney(a.goal)}</span>
                    <span>{progress?.toFixed(0)}%</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-black/10 dark:bg-white/10">
                    <div
                      className="h-1.5 rounded-full bg-black dark:bg-white"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {accounts.length === 0 && (
          <p className="text-sm text-black/50 dark:text-white/50">
            No accounts yet — add your first one above.
          </p>
        )}
      </div>
    </div>
  );
}
