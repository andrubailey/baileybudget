import Link from "next/link";
import { getMonthlyCashFlow } from "@/lib/queries";
import { getPeriods } from "@/lib/periods";
import { formatDate } from "@/lib/format";
import { Money } from "@/app/(app)/money";
import { EmptyState } from "@/app/(app)/empty-state";
import { CashFlowChart, type CashFlowPoint } from "@/app/(app)/reports/cash-flow-chart";

const MONTHS = 6;

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function monthLabel(month: string, currentYear: number, style: "short" | "long") {
  const d = new Date(`${month}-01T00:00:00Z`);
  const sameYear = d.getUTCFullYear() === currentYear;
  if (style === "short") {
    const name = d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
    return sameYear ? name : `${name}'${String(d.getUTCFullYear()).slice(2)}`;
  }
  return d.toLocaleDateString("en-US", {
    month: "long",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: "UTC",
  });
}

function toneOf(value: number): "positive" | "negative" | "neutral" {
  return value > 0 ? "positive" : value < 0 ? "negative" : "neutral";
}

// The Reports page's cash-flow view, condensed into a dashboard card: last
// six months, chart, summary strip, and month table, linking to /reports.
export async function CashFlowReportCard() {
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const start = iso(new Date(Date.UTC(currentYear, now.getUTCMonth() - (MONTHS - 1), 1)));
  const end = iso(now);

  const [months, periods] = await Promise.all([getMonthlyCashFlow(start, end), getPeriods()]);

  const periodIdByMonth = new Map(periods.map((p) => [p.start_date.slice(0, 7), p.id]));
  const hrefFor = (month: string) => {
    const id = periodIdByMonth.get(month);
    return id ? `/transactions?period=${id}` : null;
  };

  const points: CashFlowPoint[] = months.map((m) => ({
    key: m.month,
    label: monthLabel(m.month, currentYear, "short"),
    up: m.income,
    down: m.expense,
    line: m.income - m.expense,
    href: hrefFor(m.month),
  }));

  const totalIncome = months.reduce((sum, m) => sum + m.income, 0);
  const totalExpense = months.reduce((sum, m) => sum + m.expense, 0);
  const net = totalIncome - totalExpense;
  const hasActivity = months.some((m) => m.income || m.expense);

  const stats = [
    { label: "Total income", value: <Money amount={totalIncome} /> },
    { label: "Total expenses", value: <Money amount={totalExpense} /> },
    { label: "Net cash flow", value: <Money amount={net} signDisplay="auto" tone={toneOf(net)} /> },
    {
      label: "Avg cash flow / mo",
      value: <Money amount={net / Math.max(1, months.length)} signDisplay="auto" tone={toneOf(net)} />,
    },
  ];

  return (
    <section className="card-flush animate-fade-in-up overflow-hidden">
      <div className="border-b border-border px-5 py-3.5 sm:px-6">
        <Link
          href="/spending/reports"
          className="card-label inline-flex items-center gap-1 text-text-faint transition-colors hover:text-text"
        >
          Reports
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      </div>

      <div className="px-5 pt-5 pb-6 sm:px-6">
        <p className="text-sm font-medium text-text">Last {MONTHS} months</p>
        <p className="text-metadata mt-0.5">
          {formatDate(start)} – {formatDate(end)}
        </p>

        {hasActivity ? (
          <CashFlowChart points={points} mode="split" />
        ) : (
          <EmptyState message="Nothing logged in the last six months." />
        )}

        <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="bg-surface px-4 py-4 text-center">
              <p className="text-xs text-text-muted">{s.label}</p>
              <p className="tabular mt-1 text-base font-semibold text-text">{s.value}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left font-medium text-text-muted sm:px-5">
                  <span className="inline-flex items-center gap-1">
                    Month
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M12 5v14m0 0-6-6m6 6 6-6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </th>
                <th className="px-4 py-3 text-right font-medium text-text-muted sm:px-5">Income</th>
                <th className="px-4 py-3 text-right font-medium text-text-muted sm:px-5">Expenses</th>
                <th className="px-4 py-3 text-right font-medium text-text-muted sm:px-5">Net cash flow</th>
              </tr>
            </thead>
            <tbody>
              {[...months].reverse().map((m) => {
                const href = hrefFor(m.month);
                const label = monthLabel(m.month, currentYear, "long");
                const monthNet = m.income - m.expense;
                return (
                  <tr key={m.month} className="border-b border-border transition-colors last:border-b-0 hover:bg-bg">
                    <td className="px-4 py-3 font-medium text-text sm:px-5">
                      {href ? (
                        <Link href={href} className="underline-offset-2 hover:underline">
                          {label}
                        </Link>
                      ) : (
                        label
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-text sm:px-5">
                      <Money amount={m.income} />
                    </td>
                    <td className="px-4 py-3 text-right text-text sm:px-5">
                      <Money amount={m.expense} />
                    </td>
                    <td className="px-4 py-3 text-right font-medium sm:px-5">
                      <Money amount={monthNet} signDisplay="auto" tone={toneOf(monthNet)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
