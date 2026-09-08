import { getPeriodSummaryForRange, getCategoryProgressForRange, getTransactionsForRange } from "@/lib/queries";
import { formatMoney, formatDate } from "@/lib/format";

// `compact` renders this for the Reports page's sidebar column — a fixed
// 3-wide stat grid reads fine as the whole page's content but gets cramped
// squeezed into a ~320px column, so compact stacks the stats instead and
// trims the two list sections to keep the card from towering over the
// trends panel next to it.
export async function WeeklyRecapPanel({ compact = false }: { compact?: boolean } = {}) {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const prevEnd = new Date(start);
  prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setUTCDate(prevStart.getUTCDate() - 6);

  const [summary, previousSummary, categoryProgress, transactions] = await Promise.all([
    getPeriodSummaryForRange(iso(start), iso(end)),
    getPeriodSummaryForRange(iso(prevStart), iso(prevEnd)),
    getCategoryProgressForRange(iso(start), iso(end)),
    getTransactionsForRange(iso(start), iso(end)),
  ]);

  const topCategories = categoryProgress
    .filter((c) => c.actual > 0 && !/transfer/i.test(c.name))
    .sort((a, b) => b.actual - a.actual)
    .slice(0, compact ? 4 : 5);
  const recentTransactions = transactions.slice(0, compact ? 6 : 10);

  const expenseChange = summary.expense - previousSummary.expense;
  const cardPad = compact ? "p-4" : "p-5 sm:p-6";

  return (
    <div className={compact ? "space-y-4" : "space-y-6"}>
      <div>
        <p className="text-sm text-text-muted">
          {formatDate(iso(start))} – {formatDate(iso(end))}
        </p>
        {!compact && (
          <p className="mt-1 text-xs text-text-faint">
            This recap is in-app only for now — it isn&apos;t sent by email or text.
          </p>
        )}
      </div>

      <div className={`grid grid-cols-1 gap-4 sm:gap-6 ${compact ? "" : "sm:grid-cols-3"}`}>
        <StatCard label="Income" value={summary.income} pad={cardPad} index={0} />
        <StatCard label="Expenses" value={summary.expense} pad={cardPad} index={1} />
        <StatCard label="Net" value={summary.net} emphasize pad={cardPad} index={2} />
      </div>

      <div className={`rounded-xl border border-border bg-surface shadow-card ${cardPad}`}>
        <p className="text-sm text-text-muted">
          You spent{" "}
          <span className={`tabular font-medium ${expenseChange > 0 ? "text-negative" : "text-success"}`}>
            {formatMoney(Math.abs(expenseChange))} {expenseChange > 0 ? "more" : "less"}
          </span>{" "}
          than the week before ({formatMoney(previousSummary.expense)}).
        </p>
      </div>

      <div className={`rounded-xl border border-border bg-surface shadow-card ${cardPad}`}>
        <p className="mb-3 text-sm font-medium text-text-muted">Top categories this week</p>
        <ul className="space-y-2">
          {topCategories.map((c, i) => (
            <li
              key={c.id}
              style={{ animationDelay: `${i * 35}ms` }}
              className="animate-fade-in-up flex items-center justify-between text-sm"
            >
              <span className="text-text">{c.name}</span>
              <span className="tabular font-medium text-text-muted">{formatMoney(c.actual)}</span>
            </li>
          ))}
          {topCategories.length === 0 && <li className="text-sm text-text-muted">No spending logged this week.</li>}
        </ul>
      </div>

      <div className={`rounded-xl border border-border bg-surface shadow-card ${cardPad}`}>
        <p className="mb-3 text-sm font-medium text-text-muted">{transactions.length} transactions logged this week</p>
        <ul className="divide-y divide-border">
          {recentTransactions.map((t, i) => (
            <li
              key={t.id}
              style={{ animationDelay: `${i * 30}ms` }}
              className="animate-fade-in-up flex items-center justify-between py-2 text-sm"
            >
              <span className="truncate text-text">{t.description}</span>
              <span className={`tabular shrink-0 pl-2 ${t.kind === "income" ? "text-success" : "text-text-muted"}`}>
                {t.kind === "income" ? "+" : "-"}
                {formatMoney(t.amount)}
              </span>
            </li>
          ))}
          {recentTransactions.length === 0 && (
            <li className="py-2 text-sm text-text-muted">Nothing logged this week yet.</li>
          )}
        </ul>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  emphasize,
  pad,
  index = 0,
}: {
  label: string;
  value: number;
  emphasize?: boolean;
  pad: string;
  index?: number;
}) {
  return (
    <div
      style={{ animationDelay: `${index * 60}ms` }}
      className={`card-hover animate-fade-in-up flex flex-col gap-1.5 rounded-xl border border-border bg-surface shadow-card ${pad}`}
    >
      <p className="text-sm font-medium text-text-muted">{label}</p>
      <p className={`tabular text-2xl font-semibold ${emphasize ? "text-accent" : "text-text"}`}>
        {formatMoney(value)}
      </p>
    </div>
  );
}
