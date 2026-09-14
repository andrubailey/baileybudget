// Shared by the Insights page (server) and its client view: the time-range
// options, the card ids, and the saved-preferences shape stored on the
// person's profile (profiles.insights_prefs, see 030_profile_insights_prefs.sql).

export const INSIGHTS_RANGE_OPTIONS = [
  { key: "this_month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "last_3_months", label: "Last 3 months" },
  { key: "last_6_months", label: "Last 6 months" },
  { key: "ytd", label: "Year to date" },
  { key: "last_12_months", label: "Last 12 months" },
  { key: "custom", label: "Custom range" },
] as const;

export type InsightsRangeKey = (typeof INSIGHTS_RANGE_OPTIONS)[number]["key"];

// Cards that can be reordered. "noticing" is the block of dynamic findings.
export const INSIGHTS_CARD_IDS = ["cashflow", "where", "history", "noticing", "budget", "goals", "recurring"] as const;
export type InsightsCardId = (typeof INSIGHTS_CARD_IDS)[number];

// Everything that can be hidden: the reorderable cards plus the headline slot.
export const HIDEABLE_CARD_IDS = ["headline", ...INSIGHTS_CARD_IDS] as const;
export type HideableCardId = (typeof HIDEABLE_CARD_IDS)[number];

export const CARD_TITLES: Record<HideableCardId, string> = {
  headline: "Headline",
  cashflow: "Cash flow",
  where: "Where it went",
  history: "Compared with your history",
  noticing: "Worth noticing",
  budget: "Budget",
  goals: "Goals & targets",
  recurring: "Recurring costs",
};

export type InsightsPrefs = {
  range: InsightsRangeKey;
  start?: string;
  end?: string;
  order: InsightsCardId[];
  hidden: HideableCardId[];
};

export const DEFAULT_INSIGHTS_PREFS: InsightsPrefs = {
  range: "this_month",
  order: [...INSIGHTS_CARD_IDS],
  hidden: [],
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isRangeKey(value: unknown): value is InsightsRangeKey {
  return INSIGHTS_RANGE_OPTIONS.some((o) => o.key === value);
}

// Whatever is stored (or nothing, or an older/invalid shape) comes back as
// a complete, valid set of prefs: unknown ids dropped, missing cards
// appended in their default position so a newly added card always shows up.
export function normalizeInsightsPrefs(raw: unknown): InsightsPrefs {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const range = isRangeKey(value.range) ? value.range : DEFAULT_INSIGHTS_PREFS.range;
  const start = typeof value.start === "string" && ISO_DATE.test(value.start) ? value.start : undefined;
  const end = typeof value.end === "string" && ISO_DATE.test(value.end) ? value.end : undefined;
  const storedOrder = Array.isArray(value.order)
    ? value.order.filter((id): id is InsightsCardId => (INSIGHTS_CARD_IDS as readonly string[]).includes(id as string))
    : [];
  const order = [...new Set(storedOrder)];
  for (const id of INSIGHTS_CARD_IDS) if (!order.includes(id)) order.push(id);
  const hidden = Array.isArray(value.hidden)
    ? [
        ...new Set(
          value.hidden.filter((id): id is HideableCardId =>
            (HIDEABLE_CARD_IDS as readonly string[]).includes(id as string),
          ),
        ),
      ]
    : [];
  return { range, start, end, order, hidden };
}

export type ResolvedInsightsRange = {
  key: InsightsRangeKey;
  label: string;
  start: string;
  end: string;
  // The range runs up to today, so its last month isn't over yet.
  partial: boolean;
  // Calendar months that lie entirely inside the range, oldest first ("YYYY-MM").
  fullMonths: string[];
};

export function monthKeyOf(iso: string) {
  return iso.slice(0, 7);
}

export function addMonthKey(key: string, n: number) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export function monthStartIso(key: string) {
  return `${key}-01`;
}

export function monthEndIso(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export function monthKeysBetween(fromKey: string, toKey: string) {
  const keys: string[] = [];
  for (let k = fromKey; k <= toKey; k = addMonthKey(k, 1)) keys.push(k);
  return keys;
}

// Resolves a range key (plus custom dates) against today. "Last N months"
// means the N most recent complete calendar months, so comparisons are
// always month against month; "This month" and "Year to date" run to today.
export function resolveInsightsRange(
  key: string | undefined,
  customStart: string | undefined,
  customEnd: string | undefined,
  todayIso: string,
): ResolvedInsightsRange {
  const thisMonth = monthKeyOf(todayIso);
  const option = INSIGHTS_RANGE_OPTIONS.find((o) => o.key === key) ?? INSIGHTS_RANGE_OPTIONS[0];

  let start: string;
  let end: string;
  switch (option.key) {
    case "last_month":
      start = monthStartIso(addMonthKey(thisMonth, -1));
      end = monthEndIso(addMonthKey(thisMonth, -1));
      break;
    case "last_3_months":
    case "last_6_months":
    case "last_12_months": {
      const n = option.key === "last_3_months" ? 3 : option.key === "last_6_months" ? 6 : 12;
      start = monthStartIso(addMonthKey(thisMonth, -n));
      end = monthEndIso(addMonthKey(thisMonth, -1));
      break;
    }
    case "ytd":
      start = `${todayIso.slice(0, 4)}-01-01`;
      end = todayIso;
      break;
    case "custom": {
      const validStart = customStart && ISO_DATE.test(customStart) ? customStart : null;
      const validEnd = customEnd && ISO_DATE.test(customEnd) ? customEnd : null;
      if (validStart && validEnd && validStart <= validEnd) {
        start = validStart;
        end = validEnd > todayIso ? todayIso : validEnd;
        if (start > end) start = end;
        break;
      }
      return resolveInsightsRange("this_month", undefined, undefined, todayIso);
    }
    case "this_month":
    default:
      start = monthStartIso(thisMonth);
      end = todayIso;
      break;
  }

  const fullMonths = monthKeysBetween(monthKeyOf(start), monthKeyOf(end)).filter(
    (k) => monthStartIso(k) >= start && monthEndIso(k) <= end && monthEndIso(k) < todayIso,
  );
  return {
    key: option.key,
    label: option.label,
    start,
    end,
    partial: end >= monthStartIso(thisMonth),
    fullMonths,
  };
}
