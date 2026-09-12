import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  const text = readFileSync(
    "/Users/andrubailey/My Drive/My Files/Budget App/.env.local",
    "utf8",
  );
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

const TABLES = [
  "accounts",
  "categories",
  "periods",
  "budget_lines",
  "transactions",
  "transaction_splits",
  "recurring_transactions",
  "objectives",
  "transaction_history",
  "profiles",
  "loans",
];

async function fetchWholeTable(table) {
  const PAGE_SIZE = 1000;
  let from = 0;
  let total = 0;
  let pages = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      if (/does not exist|relation/i.test(error.message)) return { rows: 0, pages: 0 };
      throw error;
    }
    pages++;
    total += data.length;
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return { rows: total, pages };
}

console.log("Per-table full fetch time (what a cache-miss after invalidation pays):\n");
let totalMs = 0;
for (const table of TABLES) {
  const start = performance.now();
  const { rows, pages } = await fetchWholeTable(table);
  const ms = performance.now() - start;
  totalMs += ms;
  console.log(`  ${table.padEnd(22)} ${String(rows).padStart(5)} rows  ${pages} page(s)  ${ms.toFixed(0)}ms`);
}
console.log(`\nSum of all 11 tables (current default revalidateHousehold() cost): ${totalMs.toFixed(0)}ms`);

// Simulate the sequential-refetch-on-next-read cost: after invalidation,
// unstable_cache entries are lazily refetched on first read after — not all
// 11 in parallel necessarily, since each cached function is independent,
// but Next dedupes per-request via React cache(); the real cost users pay is
// whichever tables that NEXT page actually reads that were invalidated.
console.log("\n--- Single-table fetch (e.g. just 'accounts' invalidated) ---");
{
  const start = performance.now();
  await fetchWholeTable("accounts");
  console.log(`  accounts only: ${(performance.now() - start).toFixed(0)}ms`);
}
