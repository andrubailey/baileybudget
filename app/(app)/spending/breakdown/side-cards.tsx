import { formatMoney } from "@/lib/format";
import { SegmentedProgress } from "@/app/(app)/segmented-progress";

export function CashFlowCard({ income, expenses }: { income: number; expenses: number }) {
  const max = Math.max(income, expenses, 1);
  const net = income - expenses;
  return (
    <div className="card">
      <p className="text-section-label mb-4">Cash flow</p>
      <div className="space-y-4">
        <Bar label="Income" amount={income} pct={(income / max) * 100} color="var(--positive)" sign="" />
        <Bar label="Expenses" amount={expenses} pct={(expenses / max) * 100} color="var(--accent)" sign="-" />
        <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
          <span className="text-text-muted">Net cash flow</span>
          <span className={`tabular font-semibold ${net < 0 ? "text-negative" : "text-text"}`}>
            {net < 0 ? "-" : ""}
            {formatMoney(Math.abs(net))}
          </span>
        </div>
      </div>
    </div>
  );
}

// One cash-flow line: label and amount over the app's segmented pill bar,
// scaled against whichever of income/expenses is larger.
function Bar({
  label,
  amount,
  pct,
  color,
  sign,
}: {
  label: string;
  amount: number;
  pct: number;
  color: string;
  sign: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-text-muted">{label}</span>
        <span className="tabular font-medium text-text">
          {amount > 0 ? sign : ""}
          {formatMoney(amount)}
        </span>
      </div>
      <SegmentedProgress pct={pct} overBudget={false} color={color} className="mt-2 w-full" />
    </div>
  );
}
