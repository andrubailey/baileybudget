import Link from "next/link";
import type { ReactNode } from "react";
import {
  getAccountsWithBalances,
  getCategories,
  getMonthlyCashFlow,
  type MonthlyCashFlow,
} from "@/lib/queries";
import { getPeriods } from "@/lib/periods";
import { formatDate } from "@/lib/format";
import { Money } from "@/app/(app)/money";
import { EmptyState } from "@/app/(app)/empty-state";
import { ExportCsvButton } from "./export-csv-button";
import { ImportDataButton } from "./import-data-button";
import { CashFlowChart, type CashFlowPoint } from "./cash-flow-chart";

const TABS = [
  { key: "cashflow", label: "Cash flow" },
  { key: "expenses", label: "Expenses" },
  { key: "income", label: "Income" },
  { key: "transfers", label: "Transfers" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const RANGES = [
  { key: "3m", label: "3M", title: "Last 3 months", months: 3 },
  { key: "6m", label: "6M", title: "Last 6 months", months: 6 },
  { key: "12m", label: "12M", title: "Last 12 months", months: 12 },
  { key: "ytd", label: "YTD", title: "Year to date", months: null },
] as const;

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function monthDate(month: string) {
  return new Date(`${month}-01T00:00:00Z`);
}

function chartLabel(month: string, currentYear: number) {
  const d = monthDate(month);
  const name = d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  return d.getUTCFullYear() === currentYear
    ? name
    : `${name}'${String(d.getUTCFullYear()).slice(2)}`;
}

function tableLabel(month: string, currentYear: number) {
  const d = monthDate(month);
  return d.toLocaleDateString("en-US", {
    month: "long",
    ...(d.getUTCFullYear() === currentYear ? {} : { year: "numeric" }),
    timeZone: "UTC",
  });
}

function valueFor(tab: TabKey, m: MonthlyCashFlow) {
  switch (tab) {
    case "expenses":
      return m.expense;
    case "income":
      return m.income;
    case "transfers":
      return m.transfers;
    default:
      return m.income - m.expense;
  }
}

function toneOf(value: number): "positive" | "negative" | "neutral" {
  return value > 0 ? "positive" : value < 0 ? "negative" : "neutral";
}

export async function ReportsBody({
  basePath,
  searchTab,
  searchRange,
  showActions = true,
}: {
  basePath: string;
  searchTab?: string;
  searchRange?: string;
  showActions?: boolean;
}) {
  const tab: TabKey = TABS.find((t) => t.key === searchTab)?.key ?? "cashflow";
  const range = RANGES.find((r) => r.key === searchRange) ?? RANGES[1];
  const tabLabel = TABS.find((t) => t.key === tab)!.label;

  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const startDate =
    range.months === null
      ? new Date(Date.UTC(currentYear, 0, 1))
      : new Date(Date.UTC(currentYear, now.getUTCMonth() - (range.months - 1), 1));
  const start = iso(startDate);
  const end = iso(now);

  const [months, periods, accounts, categories] = await Promise.all([
    getMonthlyCashFlow(start, end),
    getPeriods(),
    getAccountsWithBalances(),
    getCategories(),
  ]);

  const periodIdByMonth = new Map(periods.map((p) => [p.start_date.slice(0, 7), p.id]));
  const hrefFor = (month: string) => {
    const id = periodIdByMonth.get(month);
    return id ? `/transactions?period=${id}` : null;
  };

  const points: CashFlowPoint[] = months.map((m) => ({
    key: m.month,
    label: chartLabel(m.month, currentYear),
    up: tab === "cashflow" ? m.income : valueFor(tab, m),
    down: tab === "cashflow" ? m.expense : 0,
    line: valueFor(tab, m),
    href: hrefFor(m.month),
  }));

  const monthCount = Math.max(1, months.length);
  const totalIncome = months.reduce((sum, m) => sum + m.income, 0);
  const totalExpense = months.reduce((sum, m) => sum + m.expense, 0);
  const netCashFlow = totalIncome - totalExpense;
  const values = months.map((m) => valueFor(tab, m));
  const total = values.reduce((sum, v) => sum + v, 0);
  const average = total / monthCount;
  const highestIndex = values.indexOf(Math.max(...values));
  const lowestIndex = values.indexOf(Math.min(...values));
  const hasActivity = months.some((m) => m.income || m.expense || m.transfers);

  const stats: { label: string; value: ReactNode }[] =
    tab === "cashflow"
      ? [
          { label: "Total income", value: <Money amount={totalIncome} /> },
          { label: "Total expenses", value: <Money amount={totalExpense} /> },
          {
            label: "Net cash flow",
            value: <Money amount={netCashFlow} signDisplay="auto" tone={toneOf(netCashFlow)} />,
          },
          {
            label: "Avg cash flow / mo",
            value: (
              <Money
                amount={netCashFlow / monthCount}
                signDisplay="auto"
                tone={toneOf(netCashFlow)}
              />
            ),
          },
        ]
      : [
          { label: `Total ${tabLabel.toLowerCase()}`, value: <Money amount={total} /> },
          { label: "Avg / mo", value: <Money amount={average} /> },
          {
            label: "Highest month",
            value: (
              <span>
                {chartLabel(months[highestIndex].month, currentYear)} ·{" "}
                <Money amount={values[highestIndex]} />
              </span>
            ),
          },
          {
            label: "Lowest month",
            value: (
              <span>
                {chartLabel(months[lowestIndex].month, currentYear)} ·{" "}
                <Money amount={values[lowestIndex]} />
              </span>
            ),
          },
        ];

  const tableRows = [...months].reverse();

  return (
    <div className="space-y-6">
      {showActions && (
        <div className="flex items-center justify-end gap-2">
          <ExportCsvButton year={currentYear} data={months} />
          <ImportDataButton accounts={accounts} categories={categories} />
        </div>
      )}

      <section className="card-flush animate-fade-in-up overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5 sm:px-6">
          <p className="card-label text-text-faint">Reports</p>
          <div className="flex items-center gap-0.5 rounded-lg border border-border p-0.5">
            {RANGES.map((r) => (
              <Link
                key={r.key}
                href={`${basePath}?tab=${tab}&range=${r.key}`}
                scroll={false}
                aria-current={r.key === range.key ? "true" : undefined}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  r.key === range.key ? "bg-bg text-text" : "text-text-faint hover:text-text"
                }`}
              >
                {r.label}
              </Link>
            ))}
          </div>
        </div>

        <nav
          aria-label="Report type"
          className="grid grid-cols-4 border-b border-border px-2 sm:px-4"
        >
          {TABS.map((t) => {
            const isActive = t.key === tab;
            return (
              <Link
                key={t.key}
                href={`${basePath}?tab=${t.key}&range=${range.key}`}
                scroll={false}
                aria-current={isActive ? "page" : undefined}
                className={`relative px-1 py-4 text-center text-sm font-medium transition-colors ${
                  isActive ? "text-text" : "text-text-muted hover:text-text"
                }`}
              >
                {t.label}
                {isActive && (
                  <span
                    className="absolute inset-x-2 -bottom-px h-0.5 rounded-full"
                    style={{ backgroundColor: "var(--text)" }}
                  />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="px-5 pt-5 pb-6 sm:px-6">
          <p className="text-sm font-medium text-text">{range.title}</p>
          <p className="text-metadata mt-0.5">
            {formatDate(start)} – {formatDate(end)}
          </p>

          {hasActivity ? (
            <CashFlowChart points={points} mode={tab === "cashflow" ? "split" : "single"} />
          ) : (
            <EmptyState message="Nothing logged in this range yet." />
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
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left font-medium text-text-muted sm:px-5">
                    <span className="inline-flex items-center gap-1">
                      Month
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path
                          d="M12 5v14m0 0-6-6m6 6 6-6"
                          stroke="currentColor"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  </th>
                  {tab === "cashflow" ? (
                    <>
                      <th className="px-4 py-3 text-right font-medium text-text-muted sm:px-5">Income</th>
                      <th className="px-4 py-3 text-right font-medium text-text-muted sm:px-5">Expenses</th>
                      <th className="px-4 py-3 text-right font-medium text-text-muted sm:px-5">
                        Net cash flow
                      </th>
                    </>
                  ) : (
                    <>
                      <th className="px-4 py-3 text-right font-medium text-text-muted sm:px-5">{tabLabel}</th>
                      <th className="px-4 py-3 text-right font-medium text-text-muted sm:px-5">
                        Share of total
                      </th>
                      <th className="px-4 py-3 text-right font-medium text-text-muted sm:px-5">
                        vs. monthly avg
                      </th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {tableRows.map((m) => {
                  const href = hrefFor(m.month);
                  const label = tableLabel(m.month, currentYear);
                  const value = valueFor(tab, m);
                  const net = m.income - m.expense;
                  const vsAverage = value - average;
                  return (
                    <tr
                      key={m.month}
                      className="border-b border-border transition-colors last:border-b-0 hover:bg-bg"
                    >
                      <td className="px-4 py-3 font-medium text-text sm:px-5">
                        {href ? (
                          <Link href={href} className="underline-offset-2 hover:underline">
                            {label}
                          </Link>
                        ) : (
                          label
                        )}
                      </td>
                      {tab === "cashflow" ? (
                        <>
                          <td className="px-4 py-3 text-right text-text sm:px-5">
                            <Money amount={m.income} />
                          </td>
                          <td className="px-4 py-3 text-right text-text sm:px-5">
                            <Money amount={m.expense} />
                          </td>
                          <td className="px-4 py-3 text-right font-medium sm:px-5">
                            <Money amount={net} signDisplay="auto" tone={toneOf(net)} />
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-3 text-right text-text sm:px-5">
                            <Money amount={value} />
                          </td>
                          <td className="px-4 py-3 text-right text-text-muted sm:px-5">
                            {total > 0 ? Math.round((value / total) * 100) : 0}%
                          </td>
                          <td className="px-4 py-3 text-right sm:px-5">
                            <Money
                              amount={vsAverage}
                              signDisplay="auto"
                              tone={tab === "expenses" ? toneOf(-vsAverage) : toneOf(vsAverage)}
                            />
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
