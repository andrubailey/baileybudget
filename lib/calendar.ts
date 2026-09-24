import type { CalendarEvent } from "@/lib/types";

export type EventOccurrence = { event: CalendarEvent; iso: string };

// A "none" event occurs once, on its own date. A "weekly" event occurs on
// every date in range that shares its anchor date's weekday, on or after
// that anchor — projected fresh on every read instead of being materialized
// as real rows, the same "compute at render" approach recurring bills
// already use (see getUpcomingBills/buildUpcomingDays).
export function expandEventsForRange(
  events: CalendarEvent[],
  rangeStartIso: string,
  rangeEndIso: string,
): EventOccurrence[] {
  const occurrences: EventOccurrence[] = [];
  const rangeStart = new Date(`${rangeStartIso}T00:00:00Z`);
  const rangeEnd = new Date(`${rangeEndIso}T00:00:00Z`);

  for (const event of events) {
    if (event.recurrence === "none") {
      if (event.event_date >= rangeStartIso && event.event_date <= rangeEndIso) {
        occurrences.push({ event, iso: event.event_date });
      }
      continue;
    }

    const anchor = new Date(`${event.event_date}T00:00:00Z`);
    const weekday = anchor.getUTCDay();
    const cursor = new Date(anchor > rangeStart ? anchor : rangeStart);
    cursor.setUTCDate(cursor.getUTCDate() + ((weekday - cursor.getUTCDay() + 7) % 7));
    while (cursor <= rangeEnd) {
      occurrences.push({ event, iso: cursor.toISOString().slice(0, 10) });
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    }
  }

  return occurrences.sort((a, b) => a.iso.localeCompare(b.iso));
}

export type MonthGridCell = { iso: string; day: number; inMonth: boolean; isToday: boolean };

// A 6-week (42-day) grid starting on the Sunday on/before the 1st of the
// month, so a month never needs a 5th or 7th row depending on where it
// happens to fall.
export function buildMonthGrid(monthIso: string): MonthGridCell[] {
  const [year, month] = monthIso.split("-").map(Number);
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const start = new Date(firstOfMonth);
  start.setUTCDate(start.getUTCDate() - firstOfMonth.getUTCDay());

  const todayIso = new Date().toISOString().slice(0, 10);
  const cells: MonthGridCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    cells.push({ iso, day: d.getUTCDate(), inMonth: d.getUTCMonth() === month - 1, isToday: iso === todayIso });
  }
  return cells;
}

export function currentMonthIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function shiftMonth(monthIso: string, delta: number): string {
  const [year, month] = monthIso.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function weekdayName(dateIso: string): string {
  return new Date(`${dateIso}T00:00:00Z`).toLocaleString("en-US", { weekday: "long", timeZone: "UTC" });
}

export function monthLabel(monthIso: string): string {
  const [year, month] = monthIso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
