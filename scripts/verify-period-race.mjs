// Checks that migration 036 is in place and that concurrent "create this
// month" calls can't produce a duplicate. Uses the current month, which
// already exists, so a passing run writes nothing.
//   node scripts/verify-period-race.mjs
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = {};
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const today = new Date().toISOString().slice(0, 10);
const [y, m] = today.split("-").map(Number);
const iso = (d) => d.toISOString().slice(0, 10);
const range = {
  name: new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
  start_date: iso(new Date(Date.UTC(y, m - 1, 1))),
  end_date: iso(new Date(Date.UTC(y, m, 0))),
};

const count = async () =>
  (await s.from("periods").select("id", { count: "exact", head: true }).eq("start_date", range.start_date)).count;

const before = await count();
if (before !== 1) {
  console.log(`Expected exactly 1 period for ${range.start_date}, found ${before}. Resolve that first.`);
  process.exit(1);
}
const probe = await s.from("periods").upsert(range, { onConflict: "start_date", ignoreDuplicates: true });
if (probe.error) {
  console.log(`Migration 036 not applied yet (${probe.error.message}). Run supabase/036_unique_period_month.sql.`);
  process.exit(1);
}
await Promise.all(
  Array.from({ length: 10 }, () => s.from("periods").upsert(range, { onConflict: "start_date", ignoreDuplicates: true })),
);
const after = await count();
console.log(after === 1 ? `OK: 10 concurrent creates, still 1 period for ${range.name}.` : `FAIL: ${after} periods for ${range.name}.`);
process.exit(after === 1 ? 0 : 1);
