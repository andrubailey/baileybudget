// One-time cleanup for the recurring-rule duplication bug fixed in
// app/actions.ts (insertRecurringRule never linked its new rule back to the
// seed transaction, so re-opening an already-recurring transaction and
// toggling "Repeats monthly" on again silently created a second rule).
// For each group of active rules that share description+amount+account+kind,
// keeps the oldest (earliest created_at) active and pauses the rest —
// pauses, not deletes, so nothing is lost if the wrong one turns out to be
// the "real" one.
//
//   node scripts/dedupe-recurring-rules.mjs
//
// Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from
// .env.local (same vars the app itself uses).

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of text.split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}
loadEnvLocal();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const { data: rules, error } = await supabase
  .from("recurring_transactions")
  .select("id, description, amount, account_id, kind, is_active, created_at")
  .eq("is_active", true)
  .order("created_at", { ascending: true });
if (error) throw error;

const groups = new Map();
for (const r of rules) {
  const key = `${r.kind}|${r.account_id ?? ""}|${r.description.trim().toLowerCase()}|${r.amount}`;
  groups.set(key, (groups.get(key) ?? []).concat(r));
}
const dupeGroups = [...groups.values()].filter((g) => g.length > 1);

if (dupeGroups.length === 0) {
  console.log("No active duplicate recurring rules found.");
  process.exit(0);
}

let paused = 0;
for (const group of dupeGroups) {
  const [keep, ...rest] = group; // oldest first, per the order() above
  console.log(
    `"${keep.description}": keeping ${keep.id} (created ${keep.created_at}), pausing ${rest.length} newer duplicate(s)`,
  );
  const { error: updateError } = await supabase
    .from("recurring_transactions")
    .update({ is_active: false })
    .in(
      "id",
      rest.map((r) => r.id),
    );
  if (updateError) throw updateError;
  paused += rest.length;
}

console.log(`\nPaused ${paused} duplicate rule(s) across ${dupeGroups.length} group(s).`);
