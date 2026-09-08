"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Period } from "@/lib/types";

export function PeriodSwitcher({
  periods,
  selectedId,
}: {
  periods: Period[];
  selectedId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleChange(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", id);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <select
      value={selectedId}
      onChange={(e) => handleChange(e.target.value)}
      className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-text-muted outline-none transition-colors focus:border-accent sm:w-auto"
    >
      {periods.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
