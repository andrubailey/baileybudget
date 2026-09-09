// One-time backfill: cleans up every existing income/expense transaction's
// description the same way lib/merchant-name.ts's cleanMerchantDescription()
// does for new CSV imports and AI-logged transactions — stripping store
// numbers, phone numbers, city/state, trailing website suffixes (".COM"),
// and payment-processor prefixes ("SQ *"), then Title Casing the result
// ("CHICK-FIL-A #05927" -> "Chick Fil A", "TARGET.COM" -> "Target"). Keeps
// descriptions consistent regardless of when/how a transaction was entered.
// Transfers are skipped — their description is auto-generated separately
// (see backfill-transfer-descriptions.mjs) and this logic isn't meant for it.
//
//   node scripts/backfill-merchant-descriptions.mjs
//
// Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from
// .env.local (same vars the app itself uses).

import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  try {
    const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of text.split("\n")) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
    }
  } catch {
    // .env.local missing — rely on already-exported env vars instead
  }
}
loadEnvLocal();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "Missing env vars. Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Kept in sync by hand with lib/merchant-name.ts's cleanMerchantDescription —
// this script is plain Node (no TS build step), so it can't import that
// file directly.
const STATE_CODES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID",
  "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS",
  "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK",
  "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV",
  "WI", "WY", "DC",
]);
const PROCESSOR_PREFIX = /^(SQ|SP|TST|PY|PP|IC)\s?\*\s*/i;
const DOMAIN_SUFFIX = /\.(com|net|org|co(\.\w{2})?|us|io)$/i;

function cleanMerchantDescription(raw) {
  let s = raw.trim();
  if (!s) return s;

  // Only raw, ALL-CAPS statement dumps get rewritten — anything with even
  // one lowercase letter was typed by a person (or already normalized) and
  // is left completely untouched. See lib/merchant-name.ts for why.
  if (/[a-z]/.test(s)) return s;

  s = s.replace(PROCESSOR_PREFIX, "");
  s = s.replace(/\s+\d{1,2}\/\d{1,2}(\/\d{2,4})?\s*$/, "");

  const stateMatch = s.match(/\s+([A-Z]{2})\s*$/);
  if (stateMatch && STATE_CODES.has(stateMatch[1])) {
    s = s.slice(0, stateMatch.index).trim();
  }

  s = s.replace(/\s+\d{3}[-.]\d{3}[-.]\d{4}\s*$/, "");

  const cutMatch = s.match(/\s+#?\d+/);
  if (cutMatch && cutMatch.index !== undefined && cutMatch.index > 0) {
    s = s.slice(0, cutMatch.index);
  }

  s = s.replace(DOMAIN_SUFFIX, "");
  s = s.replace(/[-*]/g, " ").replace(/\s+/g, " ").trim();

  if (!s) return raw.trim();
  return s
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

const PAGE_SIZE = 1000;
const rows = [];
let from = 0;
for (;;) {
  const { data, error } = await supabase
    .from("transactions")
    .select("id, description, kind")
    .in("kind", ["income", "expense"])
    .is("deleted_at", null)
    .range(from, from + PAGE_SIZE - 1);
  if (error) {
    console.error("Failed to load transactions:", error.message);
    process.exit(1);
  }
  rows.push(...data);
  if (data.length < PAGE_SIZE) break;
  from += PAGE_SIZE;
}

let updated = 0;
let skipped = 0;
const changes = [];
for (const t of rows) {
  const cleaned = cleanMerchantDescription(t.description ?? "");
  if (!cleaned || cleaned === t.description) {
    skipped++;
    continue;
  }
  const { error } = await supabase
    .from("transactions")
    .update({ description: cleaned })
    .eq("id", t.id);
  if (error) {
    console.error(`Failed to update ${t.id}:`, error.message);
    continue;
  }
  changes.push({ id: t.id, before: t.description, after: cleaned });
  updated++;
}

console.log(
  `Cleaned up ${updated} description${updated === 1 ? "" : "s"}, ${skipped} already clean.`,
);
if (changes.length > 0) {
  console.log("\nExamples:");
  console.log(changes.slice(0, 15).map((c) => `  "${c.before}" -> "${c.after}"`).join("\n"));

  // Full before/after record — every row this touched, in case any of them
  // need to be manually reverted (this bypasses the app's own
  // updateTransaction action, so nothing was logged to transaction_history).
  const logPath = new URL(
    `./merchant-description-backfill-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
    import.meta.url,
  );
  writeFileSync(logPath, JSON.stringify(changes, null, 2));
  console.log(`\nFull before/after log written to ${logPath.pathname}`);
}
