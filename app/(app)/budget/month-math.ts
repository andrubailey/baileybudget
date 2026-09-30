// Pure date/money helpers behind the mobile Home and Money pages — no data
// access, so they're safe to import anywhere (and to test in isolation).
// Dates are whole UTC days, matching how the rest of the app reads "today".

const DAY_MS = 86_400_000;

export const dayNumber = (iso: string) =>
  Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / DAY_MS;

export const isoFromDay = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);

// The given day of a month, clamped to that month's length (a bill on the
// 31st lands on the 30th in September). month0 may overflow into next year.
export function occurrence(year: number, month0: number, dayOfMonth: number): string {
  const last = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  return isoFromDay(Date.UTC(year, month0, Math.min(dayOfMonth, last)) / DAY_MS);
}

export type MonthClock = {
  totalDays: number;
  // 1-based: the first day of the period is day 1.
  today: number;
  // Including today.
  daysLeft: number;
  elapsedPct: number;
  todayIso: string;
};

export function monthClock(startIso: string, endIso: string, todayIso: string): MonthClock {
  const start = dayNumber(startIso);
  const end = dayNumber(endIso);
  const now = dayNumber(todayIso);
  const totalDays = end - start + 1;
  const today = Math.min(totalDays, Math.max(1, now - start + 1));
  return {
    totalDays,
    today,
    daysLeft: Math.min(totalDays, Math.max(0, end - now + 1)),
    elapsedPct: (today / totalDays) * 100,
    todayIso,
  };
}

export type PaceStatus = { label: string; tone: "positive" | "caution" | "neutral" };

// Compares spend against the expected curve rather than a straight line —
// a month with rent on the 1st isn't "ahead of pace" on the 2nd.
// Labels name the direction of spending outright: "above/under/ahead of
// pace" read as good news or bad news depending on the reader.
export function paceStatus(spent: number, planned: number, expected: number): PaceStatus | null {
  if (planned <= 0) return null;
  if (spent - planned >= 1) return { label: `Over by ${wholeDollars(spent - planned)}`, tone: "caution" };
  const slack = Math.max(expected * 0.1, planned * 0.03);
  if (spent > expected + slack) return { label: "Faster than planned", tone: "caution" };
  if (spent < expected - slack) return { label: "Slower than planned", tone: "positive" };
  return { label: "On track", tone: "neutral" };
}

export function wholeDollars(value: number): string {
  return Math.round(Math.abs(value)).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}
