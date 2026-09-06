export type RangeKey = "this_month" | "last_month" | "90d" | "ytd" | "custom";

export const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: "this_month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "90d", label: "Past 90 days" },
  { key: "ytd", label: "Year to date" },
  { key: "custom", label: "Custom range" },
];

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function resolveRange(
  requested: string | undefined,
  customStart?: string,
  customEnd?: string,
): {
  key: RangeKey;
  label: string;
  start: string;
  end: string;
} {
  const option = RANGE_OPTIONS.find((r) => r.key === requested) ?? RANGE_OPTIONS[0];
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();

  let start: Date;
  let end: Date;

  switch (option.key) {
    case "last_month":
      start = new Date(Date.UTC(year, month - 1, 1));
      end = new Date(Date.UTC(year, month, 0));
      break;
    case "90d":
      end = now;
      start = new Date(now);
      start.setUTCDate(start.getUTCDate() - 89);
      break;
    case "ytd":
      start = new Date(Date.UTC(year, 0, 1));
      end = now;
      break;
    case "custom": {
      // Falls back to this month if the custom dates are missing/invalid or
      // reversed, so a bad URL can never produce an empty/backwards range.
      const validStart = customStart && ISO_DATE.test(customStart) ? customStart : null;
      const validEnd = customEnd && ISO_DATE.test(customEnd) ? customEnd : null;
      if (validStart && validEnd && validStart <= validEnd) {
        return { key: "custom", label: `${validStart} – ${validEnd}`, start: validStart, end: validEnd };
      }
      start = new Date(Date.UTC(year, month, 1));
      end = new Date(Date.UTC(year, month + 1, 0));
      return { key: "this_month", label: "This month", start: iso(start), end: iso(end) };
    }
    case "this_month":
    default:
      start = new Date(Date.UTC(year, month, 1));
      end = new Date(Date.UTC(year, month + 1, 0));
      break;
  }

  return { key: option.key, label: option.label, start: iso(start), end: iso(end) };
}

// The immediately preceding period of the same length, for "vs last period" trend comparisons.
export function getPreviousRange(start: string, end: string): { start: string; end: string } {
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  const durationDays = Math.round(
    (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
  );

  const prevEnd = new Date(startDate);
  prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setUTCDate(prevStart.getUTCDate() - durationDays);

  return { start: iso(prevStart), end: iso(prevEnd) };
}
