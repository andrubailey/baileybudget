import { getPeriods, pickPeriod } from "@/lib/periods";
import { getAccountsWithBalances, getRecurringTransactions } from "@/lib/queries";
import { formatMoney } from "@/lib/format";

export default async function CalendarPage() {
  const periods = await getPeriods();
  const period = pickPeriod(periods);

  const [recurring, accounts] = await Promise.all([
    getRecurringTransactions(),
    getAccountsWithBalances(),
  ]);

  const accountName = (id: string | null) => accounts.find((a) => a.id === id)?.name ?? null;

  if (!period) {
    return <p className="text-sm text-text-muted">Couldn&apos;t set up this month&apos;s period.</p>;
  }

  const start = new Date(`${period.start_date}T00:00:00Z`);
  const daysInMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
  const firstWeekday = start.getUTCDay();

  const activeRecurring = recurring.filter((r) => r.is_active);
  const billsByDay = new Map<number, typeof activeRecurring>();
  for (const r of activeRecurring) {
    const day = Math.min(r.day_of_month, daysInMonth);
    const list = billsByDay.get(day) ?? [];
    list.push(r);
    billsByDay.set(day, list);
  }

  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text">Bill Calendar</h1>
        <p className="mt-1 text-sm text-text-muted">
          Recurring bills for {period.name}, plotted on their due date.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4 shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)]">
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
            const dayStr = `${period.start_date.slice(0, 7)}-${String(day).padStart(2, "0")}`;
            const bills = billsByDay.get(day) ?? [];
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
                  {bills.map((b) => (
                    <div
                      key={b.id}
                      title={`${b.description} — ${formatMoney(b.amount)}${
                        accountName(b.account_id) ? ` (${accountName(b.account_id)})` : ""
                      }`}
                      className={`truncate rounded px-1 py-0.5 text-[11px] font-medium ${
                        b.kind === "income" ? "bg-success/15 text-success" : "bg-[#f04438]/10 text-[#b42318]"
                      }`}
                    >
                      {b.description}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-5 shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)]">
        <p className="mb-3 text-sm font-medium text-text-muted">This month&apos;s recurring total</p>
        <div className="flex flex-wrap gap-6 text-sm">
          <span>
            Income{" "}
            <span className="tabular font-medium text-success">
              {formatMoney(activeRecurring.filter((r) => r.kind === "income").reduce((s, r) => s + r.amount, 0))}
            </span>
          </span>
          <span>
            Bills{" "}
            <span className="tabular font-medium text-text">
              {formatMoney(activeRecurring.filter((r) => r.kind === "expense").reduce((s, r) => s + r.amount, 0))}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
