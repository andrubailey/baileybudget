// Category icons are custom line icons (see app/(app)/category-icon.tsx),
// identified by a short key. A category's `icon` column stores that key when
// someone picks one by hand; otherwise the key is guessed from the name.
//
// Older rows could hold an emoji from the previous emoji-based picker —
// those still resolve, via LEGACY_EMOJI below, so nothing needs migrating.

export const CATEGORY_ICON_KEYS = [
  "groceries",
  "dining",
  "coffee",
  "dates",
  "housing",
  "utilities",
  "bills",
  "internet",
  "phone",
  "streaming",
  "car",
  "transit",
  "travel",
  "insurance",
  "health",
  "fitness",
  "beauty",
  "shopping",
  "entertainment",
  "subscriptions",
  "education",
  "kids",
  "pets",
  "gift",
  "giving",
  "repairs",
  "debt",
  "bank",
  "savings",
  "transfer",
  "tax",
  "business",
  "income",
  "refund",
  "rollover",
  "personal",
  "other",
] as const;
export type CategoryIconKey = (typeof CATEGORY_ICON_KEYS)[number];

export const CATEGORY_ICON_LABELS: Record<CategoryIconKey, string> = {
  groceries: "Groceries",
  dining: "Dining",
  coffee: "Coffee",
  dates: "Date night",
  housing: "Housing",
  utilities: "Utilities",
  bills: "Bills",
  internet: "Internet",
  phone: "Phone",
  streaming: "Streaming",
  car: "Car",
  transit: "Transit",
  travel: "Travel",
  insurance: "Insurance",
  health: "Health",
  fitness: "Fitness",
  beauty: "Hair & beauty",
  shopping: "Shopping",
  entertainment: "Entertainment",
  subscriptions: "Subscriptions",
  education: "Education",
  kids: "Kids",
  pets: "Pets",
  gift: "Gifts",
  giving: "Giving",
  repairs: "Repairs",
  debt: "Debt",
  bank: "Bank",
  savings: "Savings",
  transfer: "Transfer",
  tax: "Taxes",
  business: "Business",
  income: "Income",
  refund: "Refund",
  rollover: "Rollover",
  personal: "Personal",
  other: "Other",
};

// First match wins, so more specific rules sit above broader ones
// ("gas bill" is a utility before "gas" is a car; "transfer" before savings).
const ICON_RULES: [RegExp, CategoryIconKey][] = [
  // Short keywords are anchored to word boundaries, or they fire inside
  // other words: "cell" in Miscellaneous, "bus" in Business, "pet" in carpet.
  [/transfer/i, "transfer"],
  [/rollover|carry ?over/i, "rollover"],
  [/refund|reimburse|cash ?back/i, "refund"],
  [/\bmisc|\bother\b/i, "other"],
  [/grocer|supermarket/i, "groceries"],
  [/coffee|\bcafe/i, "coffee"],
  [/\bdates?\b|romance/i, "dates"],
  [/restaurant|dining|\beat|\bfood|takeout|take-out/i, "dining"],
  [/\brent\b|mortgage|housing|\bhome\b/i, "housing"],
  [/utilit|electric|\bwater\b|\bpower\b|gas bill/i, "utilities"],
  [/\bbills?\b/i, "bills"],
  [/internet|wi-?fi|\bcable\b/i, "internet"],
  [/\bphones?\b|\bmobile\b|\bcell\b/i, "phone"],
  [/stream|netflix|hulu|spotify|\btv\b/i, "streaming"],
  [/subscript/i, "subscriptions"],
  [/\bcars?\b|\bauto\b|vehicle|\bgas\b|\bfuel\b|parking/i, "car"],
  [/transport|transit|\buber\b|\blyft\b|\btaxi\b|\btrain\b|\bbus\b/i, "transit"],
  [/travel|flight|hotel|vacation/i, "travel"],
  [/insurance/i, "insurance"],
  [/health|medical|doctor|pharmacy|dental/i, "health"],
  [/fitness|\bgym\b|workout/i, "fitness"],
  [/\bhair\b|beauty|salon|\bnails\b|barber|\blook\b/i, "beauty"],
  [/cloth|apparel|shopping/i, "shopping"],
  [/entertain|\bmovies?\b|\bgames?\b|concert/i, "entertainment"],
  [/education|school|tuition|\bbooks?\b/i, "education"],
  [/\bchild|\bkids?\b|daycare|babysit/i, "kids"],
  [/\bpets?\b|\bdogs?\b|\bcats?\b|\bvet\b/i, "pets"],
  [/\bgifts?\b/i, "gift"],
  [/charity|tithe|giving|donat|church/i, "giving"],
  [/repair|maintenance|hardware/i, "repairs"],
  [/\bdebt\b|\bloans?\b|credit card/i, "debt"],
  [/\bbank\b|\bfees?\b/i, "bank"],
  [/saving|emergency/i, "savings"],
  [/\btax(es)?\b/i, "tax"],
  [/business|\bllc\b|\binc\b|client/i, "business"],
  [/salary|paycheck|payroll|\bwages?\b|income/i, "income"],
  [/personal/i, "personal"],
];

const LEGACY_EMOJI: Record<string, CategoryIconKey> = {
  "🛒": "groceries", "🍽️": "dining", "☕": "coffee", "🏠": "housing", "💡": "utilities",
  "📶": "internet", "📱": "phone", "🚗": "car", "🚌": "transit", "🛡️": "insurance",
  "🩺": "health", "🏋️": "fitness", "💇": "beauty", "🛍️": "shopping", "🎬": "entertainment",
  "🔁": "subscriptions", "✈️": "travel", "🎓": "education", "🧸": "kids", "🐾": "pets",
  "🎁": "gift", "❤️": "giving", "💳": "debt", "🏦": "savings", "🧾": "tax", "💼": "business",
  "🙂": "personal", "🏷️": "other", "🎉": "entertainment", "📚": "education", "🧴": "beauty",
  "🧹": "repairs", "🐶": "pets", "🎮": "entertainment", "🌱": "other", "🚿": "utilities",
  "🔧": "repairs", "📺": "streaming", "🎧": "entertainment", "🍺": "dates", "💵": "income",
};

export function isCategoryIconKey(value: string | null | undefined): value is CategoryIconKey {
  return !!value && (CATEGORY_ICON_KEYS as readonly string[]).includes(value);
}

// The icon a category should show: its hand-picked key if it has one, else
// a legacy emoji's equivalent, else a guess from its name.
export function getCategoryIconKey(name: string, override?: string | null): CategoryIconKey {
  if (isCategoryIconKey(override)) return override;
  if (override && LEGACY_EMOJI[override]) return LEGACY_EMOJI[override];
  for (const [pattern, key] of ICON_RULES) {
    if (pattern.test(name)) return key;
  }
  return "other";
}
