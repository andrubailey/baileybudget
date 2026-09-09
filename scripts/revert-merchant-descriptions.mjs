// Reverts a run of backfill-merchant-descriptions.mjs using the before/after
// log it wrote — restores every touched transaction's `description` back to
// its `before` value.
//
//   node scripts/revert-merchant-descriptions.mjs <log-file.json>
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

const logFile = process.argv[2];
if (!logFile) {
  console.error("Usage: node scripts/revert-merchant-descriptions.mjs <log-file.json>");
  process.exit(1);
}

const changes = JSON.parse(readFileSync(logFile, "utf8"));
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

let reverted = 0;
for (const c of changes) {
  const { error } = await supabase
    .from("transactions")
    .update({ description: c.before })
    .eq("id", c.id);
  if (error) {
    console.error(`Failed to revert ${c.id}:`, error.message);
    continue;
  }
  reverted++;
}

console.log(`Reverted ${reverted} of ${changes.length} descriptions.`);
