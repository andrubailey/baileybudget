import { formatMoney, formatDate } from "@/lib/format";
import type { Transaction } from "@/lib/types";
import { TransactionAvatar } from "@/app/(app)/transaction-row";
import { EmptyState } from "@/app/(app)/empty-state";

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
      <div className="mt-1.5 h-1.5 w-full rounded-full bg-neutral-track">
        <div
          className="animate-bar-grow-x h-full rounded-full"
          style={{ width: `${Math.max(amount > 0 ? 2 : 0, pct)}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

export function LargestTransactionsCard({ transactions }: { transactions: Transaction[] }) {
  return (
    <div className="card">
      <p className="text-section-label mb-3">Largest transactions</p>
      {transactions.length === 0 ? (
        <EmptyState compact message="No spending this month yet." />
      ) : (
        <ul className="divide-y divide-border">
          {transactions.map((t) => (
            <li key={t.id} className="flex items-center gap-3 py-2.5">
              <TransactionAvatar label={t.description} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text">{t.description}</p>
                <p className="text-metadata">{formatDate(t.txn_date)}</p>
              </div>
              <span className="tabular text-amount text-text">{formatMoney(t.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MostFrequentCard({
  items,
}: {
  items: { name: string; count: number; total: number }[];
}) {
  return (
    <div className="card">
      <p className="text-section-label mb-3">Most frequent expenses</p>
      {items.length === 0 ? (
        <EmptyState compact message="No repeat merchants yet." />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {items.map((item) => (
            <div
              key={item.name}
              className="flex flex-col items-center rounded-xl border border-border px-3 py-4 text-center"
            >
              <TransactionAvatar label={item.name} size="sm" />
              <p className="mt-2 text-sm font-semibold text-text">{item.count}×</p>
              <p className="w-full truncate text-xs text-text-muted" title={item.name}>
                {item.name}
              </p>
              <p className="text-metadata tabular mt-0.5">{formatMoney(item.total)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
