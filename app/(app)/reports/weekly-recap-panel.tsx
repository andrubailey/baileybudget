import { getPeriodSummaryForRange, getCategoryProgressForRange, getTransactionsForRange } from "@/lib/queries";
import { formatMoney, formatDate } from "@/lib/format";

export async function WeeklyRecapPanel() {
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
    .filter((c) => c.actual > 0)
    .sort((a, b) => b.actual - a.actual)
    .slice(0, 5);

  const expenseChange = summary.expense - previousSummary.expense;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-text-muted">
          {formatDate(iso(start))} – {formatDate(iso(end))}
        </p>
        <p className="mt-1 text-xs text-text-faint">
          This is an in-app view only — there&apos;s no email or text delivery set up yet. That would need an email
          provider (e.g. Resend) with an API key configured, plus a scheduled job to send it automatically.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <StatCard label="Income" value={summary.income} />
        <StatCard label="Expenses" value={summary.expense} />
        <StatCard label="Net" value={summary.net} emphasize />
      </div>

      <div className="rounded-xl border border-border bg-surface p-5 shadow-card">
        <p className="text-sm text-text-muted">
          You spent{" "}
          <span className={`tabular font-medium ${expenseChange > 0 ? "text-[#f04438]" : "text-success"}`}>
            {formatMoney(Math.abs(expenseChange))} {expenseChange > 0 ? "more" : "less"}
          </span>{" "}
          than the week before ({formatMoney(previousSummary.expense)}).
        </p>
      </div>

      <div className="rounded-xl border border-border bg-surface p-5 shadow-card">
        <p className="mb-3 text-sm font-medium text-text-muted">Top categories this week</p>
        <ul className="space-y-2">
          {topCategories.map((c) => (
            <li key={c.id} className="flex items-center justify-between text-sm">
              <span className="text-text">{c.name}</span>
              <span className="tabular font-medium text-text-muted">{formatMoney(c.actual)}</span>
            </li>
          ))}
          {topCategories.length === 0 && <li className="text-sm text-text-muted">No spending logged this week.</li>}
        </ul>
      </div>

      <div className="rounded-xl border border-border bg-surface p-5 shadow-card">
        <p className="mb-3 text-sm font-medium text-text-muted">{transactions.length} transactions logged this week</p>
        <ul className="divide-y divide-border">
          {transactions.slice(0, 10).map((t) => (
            <li key={t.id} className="flex items-center justify-between py-2 text-sm">
              <span className="text-text">{t.description}</span>
              <span className={`tabular ${t.kind === "income" ? "text-success" : "text-text-muted"}`}>
                {t.kind === "income" ? "+" : "-"}
                {formatMoney(t.amount)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function StatCard({ label, value, emphasize }: { label: string; value: number; emphasize?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-surface p-5 shadow-card">
      <p className="text-sm font-medium text-text-muted">{label}</p>
      <p className={`tabular text-2xl font-semibold ${emphasize ? "text-accent" : "text-text"}`}>
        {formatMoney(value)}
      </p>
    </div>
  );
}
