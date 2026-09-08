"use client";

import type { MonthlyTotal } from "@/lib/queries";

export function ExportCsvButton({ year, data }: { year: number; data: MonthlyTotal[] }) {
  function handleClick() {
    const rows = [
      ["Month", "Income", "Expenses", "Net"],
      ...data.map((d) => [d.month, d.income.toFixed(2), d.expense.toFixed(2), (d.income - d.expense).toFixed(2)]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trends-${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-text-muted transition-colors hover:bg-bg"
    >
      Download CSV
    </button>
  );
}
