// Bank/card statement descriptions carry a lot of noise a person never
// typed themselves — store numbers, phone numbers, city/state, and the
// transaction date tacked onto the end (e.g. "PUBLIX #1892 HOSCHTON GA
// 09/03"). This strips that down to just the merchant name ("Publix") so
// imported transactions read the same as ones entered by hand.
const STATE_CODES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID",
  "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS",
  "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK",
  "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV",
  "WI", "WY", "DC",
]);

export function cleanMerchantDescription(raw: string): string {
  let s = raw.trim();
  if (!s) return s;

  // Trailing transaction date, e.g. "09/03" or "09/03/24".
  s = s.replace(/\s+\d{1,2}\/\d{1,2}(\/\d{2,4})?\s*$/, "");

  // Trailing two-letter state code, e.g. "... HOSCHTON GA".
  const stateMatch = s.match(/\s+([A-Z]{2})\s*$/);
  if (stateMatch && STATE_CODES.has(stateMatch[1])) {
    s = s.slice(0, stateMatch.index).trim();
  }

  // Trailing phone number, e.g. "999-999-9999" or "999.999.9999".
  s = s.replace(/\s+\d{3}[-.]\d{3}[-.]\d{4}\s*$/, "");

  // The merchant name is everything before the first store/reference
  // number (with or without a leading "#") — city names and location
  // codes consistently show up after it, never before.
  const cutMatch = s.match(/\s+#?\d+/);
  if (cutMatch && cutMatch.index !== undefined && cutMatch.index > 0) {
    s = s.slice(0, cutMatch.index);
  }

  // "CHICK-FIL-A" reads better as separate words once it's down to a name.
  s = s.replace(/-/g, " ").replace(/\s+/g, " ").trim();

  if (!s) return raw.trim();
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
