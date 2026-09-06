// Maps a category name to a representative emoji via keyword matching, so
// categories don't need a dedicated icon field in the database.
const ICON_RULES: [RegExp, string][] = [
  [/grocer/i, "🛒"],
  [/restaurant|dining|eat|food|takeout|take-out/i, "🍽️"],
  [/coffee|cafe/i, "☕"],
  [/rent|mortgage|housing|home/i, "🏠"],
  [/utilit|electric|water|power|gas bill/i, "💡"],
  [/internet|wifi|cable/i, "📶"],
  [/phone|mobile|cell/i, "📱"],
  [/car|auto|vehicle|gas|fuel|parking/i, "🚗"],
  [/transport|transit|uber|lyft|taxi|train|bus/i, "🚌"],
  [/insurance/i, "🛡️"],
  [/health|medical|doctor|pharmacy|dental/i, "🩺"],
  [/fitness|gym|workout/i, "🏋️"],
  [/hair|beauty|salon|nails/i, "💇"],
  [/cloth|apparel|shopping/i, "🛍️"],
  [/entertain|movie|streaming|game/i, "🎬"],
  [/subscript/i, "🔁"],
  [/travel|flight|hotel|vacation/i, "✈️"],
  [/education|school|tuition|book/i, "🎓"],
  [/child|kid|daycare|babysit/i, "🧸"],
  [/pet|dog|cat|vet/i, "🐾"],
  [/gift/i, "🎁"],
  [/charity|tithe|giving|donat/i, "❤️"],
  [/debt|loan|credit card/i, "💳"],
  [/saving|transfer/i, "🏦"],
  [/tax/i, "🧾"],
  [/business/i, "💼"],
  [/personal/i, "🙂"],
  [/misc|other/i, "🏷️"],
];

const DEFAULT_ICON = "🏷️";

export function getCategoryIcon(name: string, override?: string | null): string {
  if (override) return override;
  for (const [pattern, icon] of ICON_RULES) {
    if (pattern.test(name)) return icon;
  }
  return DEFAULT_ICON;
}
