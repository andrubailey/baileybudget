"use client";

import type { Objective } from "@/lib/types";
import { formatDate } from "@/lib/format";

const NAME_COL_WIDTH = 200;
const MONTH_COL_WIDTH = 110;
const ROW_HEIGHT = 56;

const BAR_COLOR: Record<Objective["status"], string> = {
  "Not Started": "var(--text-faint)",
  "In Progress": "var(--accent)",
  "On Hold": "var(--caution)",
  Achieved: "var(--positive)",
};

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function daysBetween(a: Date, b: Date) {
  return (b.getTime() - a.getTime()) / 86_400_000;
}

function parseDate(value: string) {
  // Date-only strings ("2026-03-01") parse as UTC midnight — appending the
  // time keeps everything in the viewer's local calendar, so a goal dated
  // March 1st doesn't slide to Feb 28th in negative-UTC-offset timezones.
  return new Date(`${value}T00:00:00`);
}

function monthLabel(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

// Horizontal Gantt-style timeline — rows are goals, columns are months, and
// each goal renders as a bar spanning its start → end date. A day-grid
// calendar can't show "this goal runs March through June" at a glance the
// way a timeline can, and that's the actual question this page exists to
// answer: when is something ending, and when does the next one start.
export function GoalsTimeline({
  objectives,
  onSelect,
}: {
  objectives: Objective[];
  onSelect?: (id: string) => void;
}) {
  const today = new Date();
  const knownDates = objectives.flatMap((o) =>
    [o.start_date, o.end_date].filter((d): d is string => Boolean(d)).map(parseDate),
  );

  const earliest = knownDates.length
    ? new Date(Math.min(today.getTime(), ...knownDates.map((d) => d.getTime())))
    : addMonths(today, -2);
  const latest = knownDates.length
    ? new Date(Math.max(today.getTime(), ...knownDates.map((d) => d.getTime())))
    : addMonths(today, 6);

  const windowStart = addMonths(startOfMonth(earliest), -1);
  // +2: one month of padding past the latest date, plus one because the
  // range below is exclusive of this final boundary.
  const windowEndExclusive = addMonths(startOfMonth(latest), 2);

  const months: Date[] = [];
  for (let m = windowStart; m < windowEndExclusive; m = addMonths(m, 1)) {
    months.push(m);
  }
  const windowEnd = months.length ? addMonths(months[months.length - 1], 1) : windowEndExclusive;
  const totalDays = Math.max(daysBetween(windowStart, windowEnd), 1);
  const trackWidth = months.length * MONTH_COL_WIDTH;
  const minBarPct = (10 / trackWidth) * 100;

  const todayPct =
    today >= windowStart && today <= windowEnd
      ? (daysBetween(windowStart, today) / totalDays) * 100
      : null;

  const sorted = [...objectives].sort((a, b) => {
    if (!a.start_date && !b.start_date) return 0;
    if (!a.start_date) return 1;
    if (!b.start_date) return -1;
    return a.start_date.localeCompare(b.start_date);
  });

  const monthGridlines = (
    <div className="absolute inset-0 flex">
      {months.map((m, i) => (
        <div
          key={i}
          className="shrink-0 border-l border-border first:border-l-0"
          style={{ width: MONTH_COL_WIDTH }}
        />
      ))}
    </div>
  );

  const todayLine = todayPct !== null && (
    <div
      className="absolute inset-y-0 z-10 w-px bg-accent"
      style={{ left: `${todayPct}%` }}
    />
  );

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-card">
      <div style={{ width: NAME_COL_WIDTH + trackWidth }}>
        {/* Month header */}
        <div className="flex border-b border-border">
          <div
            className="shrink-0 px-4 py-3 text-[11px] font-semibold tracking-wide text-text-faint uppercase"
            style={{ width: NAME_COL_WIDTH }}
          >
            Goal
          </div>
          <div className="relative" style={{ width: trackWidth }}>
            <div className="flex">
              {months.map((m, i) => (
                <div
                  key={i}
                  className="shrink-0 border-l border-border px-2 py-3 text-xs font-medium whitespace-nowrap text-text-faint first:border-l-0"
                  style={{ width: MONTH_COL_WIDTH }}
                >
                  {monthLabel(m)}
                </div>
              ))}
            </div>
            {todayLine}
          </div>
        </div>

        {/* Rows */}
        {sorted.length === 0 && (
          <p className="px-4 py-6 text-sm text-text-faint">No goals yet.</p>
        )}
        {sorted.map((o, i) => {
          const hasStart = Boolean(o.start_date);
          const hasEnd = Boolean(o.end_date);
          const rawStart = o.start_date ? parseDate(o.start_date) : windowStart;
          const rawEnd = o.end_date ? parseDate(o.end_date) : windowEnd;
          const clampedStart = rawStart < windowStart ? windowStart : rawStart;
          const clampedEnd = rawEnd > windowEnd ? windowEnd : rawEnd;
          const leftPct = (daysBetween(windowStart, clampedStart) / totalDays) * 100;
          const widthPct = Math.max(
            (daysBetween(clampedStart, clampedEnd) / totalDays) * 100,
            minBarPct,
          );
          const isOverdue =
            o.status !== "Achieved" && hasEnd && parseDate(o.end_date!) < today;
          const color = isOverdue ? "var(--negative)" : BAR_COLOR[o.status];
          const rangeLabel = hasStart
            ? hasEnd
              ? `${formatDate(o.start_date!)} – ${formatDate(o.end_date!)}`
              : `Starts ${formatDate(o.start_date!)}, ongoing`
            : hasEnd
              ? `Ends ${formatDate(o.end_date!)}`
              : "No dates set";

          return (
            <div
              key={o.id}
              style={{ height: ROW_HEIGHT, animationDelay: `${i * 40}ms` }}
              className="animate-fade-in-up flex items-center border-b border-border last:border-b-0"
            >
              <div
                className="shrink-0 truncate px-4 text-sm font-medium text-text"
                style={{ width: NAME_COL_WIDTH }}
                title={o.name}
              >
                {o.name}
              </div>
              <div
                className="relative h-full"
                style={{ width: trackWidth }}
              >
                {monthGridlines}
                {todayLine}
                {hasStart || hasEnd ? (
                  <button
                    type="button"
                    onClick={() => onSelect?.(o.id)}
                    className="absolute top-1/2 flex h-7 -translate-y-1/2 items-center overflow-hidden rounded-full px-2.5 transition-[filter] hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    style={{
                      left: `${leftPct}%`,
                      width: `${widthPct}%`,
                      backgroundColor: color,
                    }}
                    title={`${o.name}: ${rangeLabel}${isOverdue ? " (overdue)" : ""}`}
                  >
                    <span className="truncate text-[11px] font-semibold whitespace-nowrap text-white">
                      {rangeLabel}
                    </span>
                  </button>
                ) : (
                  <span className="absolute inset-y-0 left-3 flex items-center text-xs text-text-faint">
                    No dates set
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
