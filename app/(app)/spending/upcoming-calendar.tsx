import type { RecurringTransaction } from "@/lib/types";
import { formatDate, formatMoney } from "@/lib/format";
import { TransactionAvatar } from "@/app/(app)/transaction-row";

export type UpcomingDay = {
  iso: string;
  day: number;
  isToday: boolean;
  isPast: boolean;
  items: RecurringTransaction[];
};

function daysInUtcMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

// Two weeks starting from this week's Sunday. Each future day lists the
// active recurring bills and income due on it. Within the current period an
// item that has already posted is skipped; past the period's end everything
// active is shown. A bill due on the 31st lands on the last day of shorter
// months.
export function buildUpcomingDays(
  recurring: RecurringTransaction[],
  postedIds: Set<string>,
  periodEnd: string,
  todayIso: string,
): UpcomingDay[] {
  const today = new Date(`${todayIso}T00:00:00Z`);
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  const active = recurring.filter((r) => r.is_active);

  const days: UpcomingDay[] = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const dayOfMonth = d.getUTCDate();
    const lastDay = daysInUtcMonth(d.getUTCFullYear(), d.getUTCMonth());
    const isPast = iso < todayIso;
    const items = isPast
      ? []
      : active.filter((r) => {
          if (Math.min(r.day_of_month, lastDay) !== dayOfMonth) return false;
          return iso > periodEnd || !postedIds.has(r.id);
        });
    days.push({ iso, day: dayOfMonth, isToday: iso === todayIso, isPast, items });
  }
  return days;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function UpcomingCalendar({ days }: { days: UpcomingDay[] }) {
  const upcoming = days.flatMap((d) => d.items.map((r) => ({ ...r, iso: d.iso })));
  const billTotal = upcoming
    .filter((r) => r.kind === "expense")
    .reduce((sum, r) => sum + r.amount, 0);

  return (
    <div className="card flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-heading text-text">Upcoming transactions</h2>
        <span className="text-metadata">Next 2 weeks</span>
      </div>

      <div className="grid grid-cols-7 text-center text-[11px] font-medium text-text-faint">
        {WEEKDAYS.map((w) => (
          <span key={w} className="pb-1.5">
            {w}
          </span>
        ))}
      </div>
      <div className="grid flex-1 auto-rows-fr grid-cols-7 gap-1">
        {days.map((d) => (
          <div
            key={d.iso}
            className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border border-border px-0.5 py-1.5 ${
              d.isPast ? "opacity-40" : ""
            }`}
          >
            <span
              className={`flex size-6 items-center justify-center rounded-full text-xs ${
                d.isToday ? "bg-accent font-semibold text-white" : "text-text-muted"
              }`}
            >
              {d.day}
            </span>
            {d.items.slice(0, 1).map((r) => (
              <span
                key={r.id}
                className={`tabular max-w-full truncate text-[11px] font-medium ${
                  r.kind === "income" ? "text-positive" : "text-text"
                }`}
              >
                {r.kind === "income" ? "+" : ""}
                {formatMoney(r.amount)}
              </span>
            ))}
            {d.items.length > 1 && (
              <span className="text-[10px] text-text-faint">+{d.items.length - 1}</span>
            )}
          </div>
        ))}
      </div>

      {upcoming.length === 0 ? (
        <p className="mt-4 text-sm text-text-muted">
          No recurring bills or income in the next two weeks.
        </p>
      ) : (
        <>
          <ul className="mt-4 divide-y divide-border">
            {upcoming.slice(0, 4).map((r) => (
              <li key={`${r.id}-${r.iso}`} className="flex items-center gap-3 py-2.5">
                <TransactionAvatar label={r.description} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text">{r.description}</p>
                  <p className="text-metadata">{formatDate(r.iso)}</p>
                </div>
                <span
                  className={`tabular shrink-0 text-sm font-medium ${
                    r.kind === "income" ? "text-positive" : "text-text"
                  }`}
                >
                  {r.kind === "income" ? "+" : ""}
                  {formatMoney(r.amount)}
                </span>
              </li>
            ))}
          </ul>
          {billTotal > 0 && (
            <p className="text-metadata mt-2">{formatMoney(billTotal)} in bills coming up</p>
          )}
        </>
      )}
    </div>
  );
}
