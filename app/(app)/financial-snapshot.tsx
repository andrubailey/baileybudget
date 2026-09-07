import { formatMoney } from "@/lib/format";
import type { PeriodSummary } from "@/lib/queries";

export function FinancialSnapshot({
  summary,
  topCategory,
}: {
  summary: PeriodSummary;
  topCategory: { name: string; actual: number } | null;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-card">
      <p className="text-heading text-text">Last 90 days</p>

      <div className="mt-4 space-y-2.5">
        <Row label="Income" value={summary.income} />
        <Row label="Expenses" value={summary.expense} />
        <Row
          label="Net"
          value={summary.net}
          valueClassName={summary.net >= 0 ? "text-success" : "text-[#f04438]"}
        />
        {summary.savingsRate !== null && (
          <Row
            label="Savings rate"
            display={`${(summary.savingsRate * 100).toFixed(0)}%`}
          />
        )}
      </div>

      {topCategory && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="text-xs text-text-faint">Top spending category</p>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-sm font-medium text-text">{topCategory.name}</span>
            <span className="tabular text-sm text-text-muted">{formatMoney(topCategory.actual)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  display,
  valueClassName,
}: {
  label: string;
  value?: number;
  display?: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-text-muted">{label}</span>
      <span className={`tabular font-medium text-text ${valueClassName ?? ""}`}>
        {display ?? formatMoney(value ?? 0)}
      </span>
    </div>
  );
}
