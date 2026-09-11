// One-time: renames every transfer's description to plain "Transfer". Each
// row already shows its accounts ("Checking → Emergency Fund"), so the
// description doesn't need to repeat them. Before changing anything, saves
// a before/after log next to this script so the rename can be reverted.
//
//   node scripts/rename-transfers.mjs
//
// Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from
// .env.local (same vars the app itself uses).

import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

try {
  const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of text.split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
} catch {
  // .env.local missing — rely on already-exported env vars instead
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing env vars. Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const { data: transfers, error: readError } = await supabase
  .from("transactions")
  .select("id, description")
  .eq("kind", "transfer");
if (readError) {
  console.error("Failed to load transfers:", readError.message);
  process.exit(1);
}

const toChange = transfers.filter((t) => t.description !== "Transfer");
if (toChange.length === 0) {
  console.log(`All ${transfers.length} transfers are already named "Transfer". Nothing to do.`);
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const logUrl = new URL(`./transfer-rename-${stamp}.json`, import.meta.url);
writeFileSync(
  logUrl,
  JSON.stringify(
    toChange.map((t) => ({ id: t.id, before: t.description, after: "Transfer" })),
    null,
    2,
  ),
);
console.log(`Saved before/after log for ${toChange.length} transfers: ${logUrl.pathname}`);

const { error: updateError, count } = await supabase
  .from("transactions")
  .update({ description: "Transfer" }, { count: "exact" })
  .eq("kind", "transfer")
  .neq("description", "Transfer");
if (updateError) {
  console.error("Update failed:", updateError.message);
  process.exit(1);
}

console.log(`Renamed ${count} transfer description${count === 1 ? "" : "s"} to "Transfer".`);
