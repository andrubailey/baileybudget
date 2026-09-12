"use client";

import { Dropdown } from "@/app/(app)/dropdown";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Period } from "@/lib/types";

export function PeriodSwitcher({
  periods,
  selectedId,
  allTimeOption = false,
}: {
  periods: Period[];
  // A period id, or "all" when allTimeOption is on.
  selectedId: string;
  // Adds an "All time" choice (period=all) above the months.
  allTimeOption?: boolean;
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
      options={[
        ...(allTimeOption ? [{ value: "all", label: "All time" }] : []),
        ...periods.map((p) => ({ value: p.id, label: p.name })),
      ]}
    />
  );
}
