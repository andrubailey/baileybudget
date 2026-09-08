import { formatMoney } from "@/lib/format";
import type { Account, Transaction } from "@/lib/types";

// Plots every logged transaction for the period on its actual date, not
// just recurring bills — a real activity calendar instead of a bills-only
// due-date view.
export function TransactionsCalendar({
  periodStartDate,
  periodName,
  transactions,
  accounts,
}: {
  periodStartDate: string;
  periodName: string;
  transactions: Transaction[];
  accounts: Account[];
}) {
  const accountName = (id: string | null) => accounts.find((a) => a.id === id)?.name ?? null;

  const start = new Date(`${periodStartDate}T00:00:00Z`);
  const daysInMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
  const firstWeekday = start.getUTCDay();
  const monthPrefix = periodStartDate.slice(0, 7);

  const byDay = new Map<number, Transaction[]>();
  for (const t of transactions) {
    if (!t.txn_date.startsWith(monthPrefix)) continue;
    const day = Number(t.txn_date.slice(8, 10));
    const list = byDay.get(day) ?? [];
    list.push(t);
    byDay.set(day, list);
  }

  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const today = new Date().toISOString().slice(0, 10);

  const totalIncome = transactions.filter((t) => t.kind === "income").reduce((s, t) => s + t.amount, 0);
  const totalExpense = transactions.filter((t) => t.kind === "expense").reduce((s, t) => s + t.amount, 0);

  return (
    <div className="space-y-6">
      <p className="text-sm text-text-muted">
        Every transaction logged in {periodName}, plotted on the day it happened.
      </p>

      <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-text-faint">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="py-1">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (day === null) return <div key={i} />;
            const dayStr = `${monthPrefix}-${String(day).padStart(2, "0")}`;
            const dayTxns = byDay.get(day) ?? [];
            const shown = dayTxns.slice(0, 3);
            const extraCount = dayTxns.length - shown.length;
            const isToday = dayStr === today;
            return (
              <div
                key={i}
                className={`min-h-[84px] rounded-lg border p-1.5 text-left ${
                  isToday ? "border-accent bg-accent-soft" : "border-border bg-bg"
                }`}
              >
                <p className={`text-xs font-medium ${isToday ? "text-accent" : "text-text-faint"}`}>{day}</p>
                <div className="mt-1 space-y-1">
                  {shown.map((t) => (
                    <div
                      key={t.id}
                      title={`${t.description} — ${formatMoney(t.amount)}${
                        t.account_id && accountName(t.account_id) ? ` (${accountName(t.account_id)})` : ""
                      }`}
                      className={`truncate rounded px-1 py-0.5 text-[11px] font-medium ${
                        t.kind === "income"
                          ? "bg-success/15 text-success"
                          : t.kind === "transfer"
                            ? "bg-[#0ba5ec]/10 text-[#0ba5ec]"
                            : "bg-[#f04438]/10 text-[#b42318]"
                      }`}
                    >
                      {t.description}
                    </div>
                  ))}
                  {extraCount > 0 && (
                    <p className="px-1 text-[10px] font-medium text-text-faint">+{extraCount} more</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-5 shadow-card">
        <p className="mb-3 text-sm font-medium text-text-muted">{periodName} totals</p>
        <div className="flex flex-wrap gap-6 text-sm">
          <span>
            Income <span className="tabular font-medium text-success">{formatMoney(totalIncome)}</span>
          </span>
          <span>
            Expenses <span className="tabular font-medium text-text">{formatMoney(totalExpense)}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
