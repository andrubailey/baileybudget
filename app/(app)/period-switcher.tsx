"use client";

import { Dropdown } from "@/app/(app)/dropdown";

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
    <Dropdown
      variant="pill"
      className="w-full sm:w-auto"
      aria-label="Month"
      value={selectedId}
      onChange={handleChange}
      options={periods.map((p) => ({ value: p.id, label: p.name }))}
    />
  );
}
