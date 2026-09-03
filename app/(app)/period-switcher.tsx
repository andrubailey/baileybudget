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
      className="rounded-full border border-border bg-surface px-4 py-1.5 text-sm text-text outline-none transition-colors focus:border-accent"
    >
      {periods.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
