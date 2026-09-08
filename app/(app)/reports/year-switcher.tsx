"use client";

import { useRouter } from "next/navigation";

export function YearSwitcher({ year, years }: { year: number; years: number[] }) {
  const router = useRouter();

  return (
    <select
      value={year}
      onChange={(e) => router.push(`/reports?year=${e.target.value}`)}
      className="rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-text-muted outline-none transition-colors focus:border-accent"
    >
      {years.map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </select>
  );
}
