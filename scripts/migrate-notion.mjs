// One-time import: pulls expense data from the Notion "Ultimate Budget" template
// straight into this app's Supabase tables. Run locally once:
//
//   NOTION_TOKEN=secret_xxx SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=xxx \
//     node scripts/migrate-notion.mjs
//
// See README.md "Importing from Notion" for how to get NOTION_TOKEN and the service role key.

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

// Notion database IDs for the "Ultimate Budget" template structure.
const DB = {
  accounts: "234b34ad-10cd-81d9-be50-000bd57df8e2",
  categories: "234b34ad-10cd-81e6-af5c-000b8bba3c1f", // "Budget" table (one row per category per month — imported as-is, one category per period)
  periods: "234b34ad-10cd-8157-886b-000b188bf82f", // "Time Periods" table
  expenses: "234b34ad-10cd-8168-8e4a-000b03420878",
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
function dateStart(props, name) {
  return props[name]?.date?.start ?? null;
}
function relationId(props, name) {
  return props[name]?.relation?.[0]?.id ?? null;
}
function statusName(props, name) {
  return props[name]?.status?.name ?? null;
}
function multiSelectNames(props, name) {
  return (props[name]?.multi_select ?? []).map((o) => o.name);
}

const TAG_MAP = {
  Reoccurring: "Recurring",
  Personal: "Personal",
  Business: "Business",
  Savings: "Savings",
  Pending: "Pending",
};

function mapTags(names) {
  const mapped = names.map((n) => TAG_MAP[n]).filter(Boolean);
  return [...new Set(mapped)];
}

// Category rows are named e.g. "Groceries - AUG26"; strip the " - MONYY" suffix
// for display since the period is already tracked separately via period_id.
function baseCategoryName(name) {
  return name.replace(/\s*-\s*[A-Za-z]{3}\d{2}$/, "").trim();
}

async function main() {
  console.log("Fetching from Notion...");
  const [accountPages, categoryPages, periodPages, expensePages] =
    await Promise.all([
      queryAll(DB.accounts),
      queryAll(DB.categories),
      queryAll(DB.periods),
      queryAll(DB.expenses),
    ]);
  console.log(
    `Fetched ${accountPages.length} accounts, ${categoryPages.length} category rows, ${periodPages.length} periods, ${expensePages.length} expenses`,
  );

  // --- Accounts ---
  const accountIdMap = new Map(); // notion page id -> supabase account id
  for (const page of accountPages) {
    const name = title(page.properties, "Name");
    if (!name) continue;
    const starting_balance = number(page.properties, "Starting Balance") ?? 0;
    const status = statusName(page.properties, "Status");
    const { data, error } = await supabase
      .from("accounts")
      .insert({
        name,
        starting_balance,
        is_active: status !== "Deactivated",
      })
      .select("id")
      .single();
    if (error) throw error;
    accountIdMap.set(page.id, data.id);
  }
  console.log(`Inserted ${accountIdMap.size} accounts`);

  // --- Periods ---
  const periodIdMap = new Map(); // notion page id -> supabase period id
  for (const page of periodPages) {
    const name = title(page.properties, "Period Name");
    const start_date = dateStart(page.properties, "Start Date");
    const end_date = dateStart(page.properties, "End Date");
    if (!name || !start_date || !end_date) continue;
    const { data, error } = await supabase
      .from("periods")
      .insert({ name, start_date, end_date })
      .select("id")
      .single();
    if (error) throw error;
    periodIdMap.set(page.id, data.id);
  }
  console.log(`Inserted ${periodIdMap.size} periods`);

  // --- Categories: one per Notion Budget row, scoped to its period ---
  const categoryPageToId = new Map(); // notion page id -> supabase category id
  let categoryCount = 0;
  for (const page of categoryPages) {
    const rawName = title(page.properties, "Name");
    if (!rawName) continue;
    const periodPageId = relationId(page.properties, "Month");
    const period_id = periodIdMap.get(periodPageId);
    if (!period_id) continue; // category not tied to an imported period

    const planned_amount = number(page.properties, "Planned") ?? 0;
    const { data, error } = await supabase
      .from("categories")
      .insert({
        name: baseCategoryName(rawName),
        kind: "expense",
        period_id,
        planned_amount,
        is_need: false,
      })
      .select("id")
      .single();
    if (error) throw error;
    categoryPageToId.set(page.id, data.id);
    categoryCount++;
  }
  console.log(`Inserted ${categoryCount} expense categories`);

  // --- Transactions ---
  const rows = [];
  for (const page of expensePages) {
    const description = title(page.properties, "Source");
    const amount = number(page.properties, "Amount");
    const txn_date = dateStart(page.properties, "Date");
    const periodPageId = relationId(page.properties, "Month");
    if (!description || amount == null || !txn_date) continue;
    const period_id = periodIdMap.get(periodPageId);
    if (!period_id) continue; // skip rows whose month wasn't imported (e.g. blank period)

    const accountPageId = relationId(page.properties, "Account");
    const categoryPageId = relationId(page.properties, "Category");
    const account_id = accountPageId
      ? (accountIdMap.get(accountPageId) ?? null)
      : null;
    const category_id = categoryPageId
      ? (categoryPageToId.get(categoryPageId) ?? null)
      : null;
    const tags = mapTags(multiSelectNames(page.properties, "Tags"));

    rows.push({
      kind: "expense",
      description,
      amount,
      txn_date,
      account_id,
      category_id,
      period_id,
      tags,
    });
  }

  console.log(`Inserting ${rows.length} transactions...`);
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase.from("transactions").insert(chunk);
    if (error) throw error;
    console.log(`  inserted ${Math.min(i + CHUNK, rows.length)}/${rows.length}`);
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
