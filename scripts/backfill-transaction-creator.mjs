// One-time backfill: sets created_by/created_by_email to andrubailey@gmail.com
// on every non-deleted transaction that currently has no creator recorded
// (15 rows as of 2026-09-11 — old imported/migrated data from before the
// column existed). Only touches rows with a null created_by_email; never
// reassigns a transaction that's already attributed to someone.
//
//   node scripts/backfill-transaction-creator.mjs
//
// Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from
// .env.local (same vars the app itself uses). Saves a before-snapshot of
// every row it touches next to this script, same pattern as
// revert-merchant-descriptions.mjs, so the change can be undone.

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

const TARGET_EMAIL = "andrubailey@gmail.com";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const { data: users, error: usersError } = await supabase.auth.admin.listUsers();
if (usersError) throw usersError;
const target = users.users.find((u) => u.email === TARGET_EMAIL);
if (!target) throw new Error(`No user found with email ${TARGET_EMAIL}`);

const { data: rows, error: selectError } = await supabase
  .from("transactions")
  .select("id, description, created_by, created_by_email")
  .is("deleted_at", null)
  .is("created_by_email", null);
if (selectError) throw selectError;

if (rows.length === 0) {
  console.log("Nothing to backfill — every transaction already has a creator.");
  process.exit(0);
}

const snapshotPath = new URL(
  `./transaction-creator-backfill-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  import.meta.url,
);
writeFileSync(snapshotPath, JSON.stringify(rows, null, 2));
console.log(`Saved before-snapshot of ${rows.length} rows to ${snapshotPath.pathname}`);

const { error: updateError } = await supabase
  .from("transactions")
  .update({ created_by: target.id, created_by_email: target.email })
  .is("deleted_at", null)
  .is("created_by_email", null);
if (updateError) throw updateError;

console.log(`Set created_by_email = ${target.email} on ${rows.length} transactions.`);
