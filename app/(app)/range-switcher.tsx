"use client";

import { DatePicker } from "@/app/(app)/date-picker";

import { Dropdown } from "@/app/(app)/dropdown";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { RANGE_OPTIONS, type RangeKey } from "@/lib/ranges";

export function RangeSwitcher({
  selected,
  start,
  end,
}: {
  selected: RangeKey;
  start: string;
  end: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [customStart, setCustomStart] = useState(start);
  const [customEnd, setCustomEnd] = useState(end);

  function pushParams(params: URLSearchParams) {
    router.push(`${pathname}?${params.toString()}`);
  }

  function handleChange(key: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", key);
    if (key === "custom") {
      params.set("start", customStart);
      params.set("end", customEnd);
    } else {
      params.delete("start");
      params.delete("end");
    }
    pushParams(params);
  }

  function applyCustomRange(nextStart: string, nextEnd: string) {
    if (!nextStart || !nextEnd) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", "custom");
    params.set("start", nextStart);
    params.set("end", nextEnd);
    pushParams(params);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Dropdown
        variant="pill"
        aria-label="Date range"
        value={selected}
        onChange={handleChange}
        options={RANGE_OPTIONS.map((r) => ({ value: r.key, label: r.label }))}
      />

      {selected === "custom" && (
        <div className="flex items-center gap-2">
          <DatePicker
            variant="pill"
            aria-label="Start date"
            value={customStart}
            max={customEnd || undefined}
            onChange={(next) => {
              setCustomStart(next);
              applyCustomRange(next, customEnd);
            }}
          />
          <span className="text-text-faint">–</span>
          <DatePicker
            variant="pill"
            aria-label="End date"
            value={customEnd}
            min={customStart || undefined}
            onChange={(next) => {
              setCustomEnd(next);
              applyCustomRange(customStart, next);
            }}
          />
        </div>
      )}
    </div>
  );
}
