"use client";

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
      <select
        value={selected}
        onChange={(e) => handleChange(e.target.value)}
        className="rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-text-muted outline-none transition-colors focus:border-accent"
      >
        {RANGE_OPTIONS.map((r) => (
          <option key={r.key} value={r.key}>
            {r.label}
          </option>
        ))}
      </select>

      {selected === "custom" && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={customStart}
            max={customEnd}
            onChange={(e) => {
              setCustomStart(e.target.value);
              applyCustomRange(e.target.value, customEnd);
            }}
            className="rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text outline-none focus:border-accent"
          />
          <span className="text-text-faint">–</span>
          <input
            type="date"
            value={customEnd}
            min={customStart}
            onChange={(e) => {
              setCustomEnd(e.target.value);
              applyCustomRange(customStart, e.target.value);
            }}
            className="rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text outline-none focus:border-accent"
          />
        </div>
      )}
    </div>
  );
}
