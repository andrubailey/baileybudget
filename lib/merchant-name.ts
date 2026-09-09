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

// Common payment-processor prefixes that ride along in front of the actual
// merchant name on a card statement (e.g. "SQ *CHICK-FIL-A", "TST* TARGET").
const PROCESSOR_PREFIX = /^(SQ|SP|TST|PY|PP|IC)\s?\*\s*/i;

// Trailing top-level domain, e.g. "TARGET.COM" or "AMAZON.CO.UK" — a website
// suffix, not part of the merchant's actual name.
const DOMAIN_SUFFIX = /\.(com|net|org|co(\.\w{2})?|us|io)$/i;

export function cleanMerchantDescription(raw: string): string {
  let s = raw.trim();
  if (!s) return s;

  // Only raw, ALL-CAPS statement dumps get rewritten — anything with even
  // one lowercase letter was typed by a person (or already normalized) and
  // is left completely untouched. Without this guard, the cleanup below
  // (title-casing every word, cutting a trailing number, stripping a
  // trailing ".xyz") corrupts perfectly good descriptions: "UnitedHealth
  // Insurance" -> "Unitedhealth Insurance", "Kitchen 121" -> "Kitchen"
  // (losing real data), "Transfer from Personal Checking" -> "...From
  // Personal Checking", "John Lee OB" -> "...Ob". Real bank/card statement
  // text is reliably uppercase; a hand-typed sentence reliably isn't.
  if (/[a-z]/.test(s)) return s;

  s = s.replace(PROCESSOR_PREFIX, "");

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

  // A trailing website suffix ("TARGET.COM" -> "TARGET") — checked after the
  // reference-number cut above since a store number can itself follow it
  // ("AMAZON.COM*A1B2C3").
  s = s.replace(DOMAIN_SUFFIX, "");

  // "CHICK-FIL-A" reads better as separate words once it's down to a name.
  s = s.replace(/[-*]/g, " ").replace(/\s+/g, " ").trim();

  if (!s) return raw.trim();
  // Title Case each word ("Chick Fil A"), not just the first letter of the
  // whole string — a plain "Chick fil a" doesn't read as a proper name.
  return s
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}
