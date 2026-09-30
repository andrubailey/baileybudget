import type { Transaction } from "@/lib/types";

// One control, not a bar. Everything heavier — date ranges, account filters,
// amount thresholds, bulk edits — stays on the desktop /transactions page.
export type ActivityFilter =
  | { kind: "all" }
  | { kind: "uncategorized" }
  | { kind: "month" }
  | { kind: "person"; id: string };

export function filterLabel(
  filter: ActivityFilter,
  personName: (id: string) => string,
): string {
  switch (filter.kind) {
    case "all":
      return "Everything";
    case "uncategorized":
      return "Uncategorized";
    case "month":
      return "This month";
    case "person":
      return personName(filter.id);
  }
}

export function applyFilter(
  transactions: Transaction[],
  filter: ActivityFilter,
): Transaction[] {
  switch (filter.kind) {
    case "all":
      return transactions;
    case "uncategorized":
      // Transfers never carry a category, so counting them as uncategorized
      // would bury the actual gaps under every transfer ever logged.
      return transactions.filter(
        (t) => t.kind !== "transfer" && !t.category_id,
      );
    case "month": {
      const prefix = new Date().toISOString().slice(0, 7);
      return transactions.filter((t) => t.txn_date.startsWith(prefix));
    }
    case "person":
      return transactions.filter((t) => t.created_by === filter.id);
  }
}

export type ActivityDay = {
  date: string;
  transactions: Transaction[];
};

// Reverse chronological, grouped by the day it happened. Same-day entries keep
// newest-logged first, so something just added lands at the top of its day
// rather than somewhere in the middle of it.
export function groupByDay(transactions: Transaction[]): ActivityDay[] {
  const days: ActivityDay[] = [];
  const sorted = transactions
    .slice()
    .sort(
      (a, b) =>
        b.txn_date.localeCompare(a.txn_date) ||
        b.created_at.localeCompare(a.created_at),
    );
  for (const t of sorted) {
    const last = days[days.length - 1];
    if (last && last.date === t.txn_date) last.transactions.push(t);
    else days.push({ date: t.txn_date, transactions: [t] });
  }
  return days;
}

export function dayHeading(iso: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  if (iso === today) return "Today";
  if (iso === yesterday) return "Yesterday";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
