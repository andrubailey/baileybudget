// One-time import of Notion's per-month "Planned" amounts into budget_lines.
// Companion to migrate-notion.mjs (which already imported categories, periods,
// and expenses) — reuses those existing rows by matching on name instead of
// re-inserting them, so it's safe to run after that script.
//
//   NOTION_TOKEN=secret_xxx SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=xxx \
//     node scripts/migrate-notion-planned.mjs

import { Client } from "@notionhq/client";
import { createClient } from "@supabase/supabase-js";

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!NOTION_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "Missing env vars. Required: NOTION_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY",
  );
  process.exit(1);
}

const notion = new Client({ auth: NOTION_TOKEN });
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const DB = {
  categories: "234b34ad-10cd-81e6-af5c-000b8bba3c1f", // "Budget" table (one row per category per month)
  periods: "234b34ad-10cd-8157-886b-000b188bf82f",
};

async function queryAll(data_source_id) {
  const pages = [];
  let cursor = undefined;
  do {
    const res = await notion.dataSources.query({
      data_source_id,
      start_cursor: cursor,
      page_size: 100,
    });
    pages.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return pages;
}

function title(props, name) {
  return props[name]?.title?.[0]?.plain_text ?? null;
}
function number(props, name) {
  return props[name]?.number ?? null;
}
function relationId(props, name) {
  return props[name]?.relation?.[0]?.id ?? null;
}

// Category rows are named e.g. "Groceries - AUG26"; strip the " - MONYY" suffix
// to match the deduped category name already in Supabase.
function baseCategoryName(name) {
  return name.replace(/\s*-\s*[A-Za-z]{3}\d{2}$/, "").trim();
}

async function main() {
  console.log("Fetching from Notion...");
  const [categoryPages, periodPages] = await Promise.all([
    queryAll(DB.categories),
    queryAll(DB.periods),
  ]);
  console.log(
    `Fetched ${categoryPages.length} category rows, ${periodPages.length} periods`,
  );

  const { data: existingCategories, error: catErr } = await supabase
    .from("categories")
    .select("id, name")
    .eq("kind", "expense");
  if (catErr) throw catErr;
  const categoryIdByName = new Map(existingCategories.map((c) => [c.name, c.id]));

  const { data: existingPeriods, error: perErr } = await supabase
    .from("periods")
    .select("id, name");
  if (perErr) throw perErr;
  const periodIdByName = new Map(existingPeriods.map((p) => [p.name, p.id]));

  const periodNameByPageId = new Map();
  for (const page of periodPages) {
    const name = title(page.properties, "Period Name");
    if (name) periodNameByPageId.set(page.id, name);
  }

  const rows = [];
  const unmatched = new Set();
  for (const page of categoryPages) {
    const rawName = title(page.properties, "Name");
    if (!rawName) continue;
    const planned = number(page.properties, "Planned");
    if (planned == null) continue;

    const periodPageId = relationId(page.properties, "Month");
    const periodName = periodPageId ? periodNameByPageId.get(periodPageId) : null;
    const period_id = periodName ? periodIdByName.get(periodName) : null;

    const baseName = baseCategoryName(rawName);
    const category_id = categoryIdByName.get(baseName);

    if (!category_id || !period_id) {
      unmatched.add(`${baseName} / ${periodName ?? "?"}`);
      continue;
    }

    rows.push({ category_id, period_id, planned_amount: planned });
  }

  console.log(`Upserting ${rows.length} planned amounts...`);
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase
      .from("budget_lines")
      .upsert(chunk, { onConflict: "category_id,period_id" });
    if (error) throw error;
    console.log(`  upserted ${Math.min(i + CHUNK, rows.length)}/${rows.length}`);
  }

  if (unmatched.size > 0) {
    console.log(`\nSkipped ${unmatched.size} rows with no matching category/period:`);
    for (const u of unmatched) console.log(`  - ${u}`);
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
