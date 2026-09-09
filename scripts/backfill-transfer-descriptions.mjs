// One-time backfill: rewrites every existing transfer's description to
// "From X to Y" (the two account names), matching the auto-generated
// description new transfers get from createTransfer/the AI logging path.
// Old transfers were saved with whatever text was typed (or "Transfer" as a
// fallback), so they don't match that format until this runs once.
//
//   node scripts/backfill-transfer-descriptions.mjs
//
// Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from
// .env.local (same vars the app itself uses).

import { readFileSync } from "node:fs";
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

const { data: accounts, error: accountsError } = await supabase
  .from("accounts")
  .select("id, name");
if (accountsError) {
  console.error("Failed to load accounts:", accountsError.message);
  process.exit(1);
}
const nameById = new Map(accounts.map((a) => [a.id, a.name]));

const { data: transfers, error: transfersError } = await supabase
  .from("transactions")
  .select("id, description, account_id, to_account_id")
  .eq("kind", "transfer")
  .is("deleted_at", null);
if (transfersError) {
  console.error("Failed to load transfers:", transfersError.message);
  process.exit(1);
}

let updated = 0;
let skipped = 0;
for (const t of transfers) {
  const fromName = nameById.get(t.account_id) ?? "account";
  const toName = nameById.get(t.to_account_id) ?? "account";
  const description = `From ${fromName} to ${toName}`;
  if (t.description === description) {
    skipped++;
    continue;
  }
  const { error } = await supabase
    .from("transactions")
    .update({ description })
    .eq("id", t.id);
  if (error) {
    console.error(`Failed to update ${t.id}:`, error.message);
    continue;
  }
  updated++;
}

console.log(
  `Backfilled ${updated} transfer description${updated === 1 ? "" : "s"}, ${skipped} already matched.`,
);
