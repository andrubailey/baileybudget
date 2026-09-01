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
      className="rounded-md border border-black/15 bg-transparent px-3 py-1.5 text-sm dark:border-white/15"
    >
      {periods.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
