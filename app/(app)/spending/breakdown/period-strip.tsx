"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { formatMoney } from "@/lib/format";

export type StripMonth = {
  periodId: string;
  label: string;
  name: string;
  startDate: string;
  expense: number;
  income: number;
};

// The time-period strip: one column per month with a small bar for what
// was spent, the selected month highlighted. Clicking a month reloads the
// view for it. Scrolls so the selected month is visible.
export function PeriodStrip({ months, selectedId }: { months: StripMonth[]; selectedId: string }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const max = Math.max(1, ...months.map((m) => m.expense));
  const selectedIndex = months.findIndex((m) => m.periodId === selectedId);
  const prev = months[selectedIndex - 1] ?? null;
  const next = months[selectedIndex + 1] ?? null;

  useEffect(() => {
    const el = scrollerRef.current?.querySelector<HTMLElement>('[data-selected="true"]');
    el?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [selectedId]);

  return (
    <div className="card p-0 sm:p-0">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <p className="text-section-label">Time period</p>
        <span className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-text">
          Monthly
        </span>
      </div>
      <div className="flex items-center gap-1 px-2 py-4">
        <StepLink href={prev ? `/spending/breakdown?period=${prev.periodId}` : null} direction="prev" />
        <div
          ref={scrollerRef}
          className="flex flex-1 items-end gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {months.map((m) => {
            const selected = m.periodId === selectedId;
            const h = m.expense > 0 ? Math.max(4, (m.expense / max) * 48) : 2;
            return (
              <Link
                key={m.periodId}
                href={`/spending/breakdown?period=${m.periodId}`}
                data-selected={selected ? "true" : "false"}
                title={`${m.name}: ${formatMoney(m.expense)} spent`}
                className={`flex min-w-[72px] flex-1 flex-col items-center justify-end gap-2 rounded-xl px-2 pt-6 pb-3 transition-colors ${
                  selected ? "bg-bg ring-1 ring-border" : "hover:bg-bg/60"
                }`}
              >
                <span className="flex h-12 items-end">
                  <span
                    className={`block w-3 rounded-sm ${selected ? "bg-accent" : "bg-neutral-track"}`}
                    style={{ height: h }}
                    aria-hidden="true"
                  />
                </span>
                <span
                  className={`text-xs whitespace-nowrap ${selected ? "font-semibold text-text" : "text-text-muted"}`}
                >
                  {shortName(m.name)}
                </span>
              </Link>
            );
          })}
        </div>
        <StepLink href={next ? `/spending/breakdown?period=${next.periodId}` : null} direction="next" />
      </div>
    </div>
  );
}

function shortName(name: string) {
  const [month, year] = name.split(" ");
  const thisYear = String(new Date().getFullYear());
  return year && year !== thisYear ? `${month.slice(0, 3)}'${year.slice(2)}` : month.slice(0, 3);
}

function StepLink({ href, direction }: { href: string | null; direction: "prev" | "next" }) {
  const icon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d={direction === "prev" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"}
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
  const cls = "flex size-9 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors";
  if (!href) return <span className={`${cls} opacity-30`}>{icon}</span>;
  return (
    <Link href={href} aria-label={direction === "prev" ? "Previous month" : "Next month"} className={`${cls} hover:bg-bg hover:text-text`}>
      {icon}
    </Link>
  );
}
