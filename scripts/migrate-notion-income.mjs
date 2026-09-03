// One-time import of Notion income transactions/categories into Supabase.
// Companion to migrate-notion.mjs (which already imported accounts, periods,
// and expenses) — reuses those existing rows by matching on name instead of
// re-inserting them, so it's safe to run after that script.
//
//   NOTION_TOKEN=secret_xxx SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=xxx \
//     node scripts/migrate-notion-income.mjs

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
  accounts: "234b34ad-10cd-81d9-be50-000bd57df8e2",
  periods: "234b34ad-10cd-8157-886b-000b188bf82f",
  incomeCategories: "234b34ad-10cd-81b1-b422-000b7a28ab9d",
  income: "234b34ad-10cd-81b6-9e14-000b5c17ef72",
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
  Personal: "Personal",
  Business: "Business",
  Savings: "Savings",
  Pending: "Pending",
  // "Retainer" has no equivalent in this app's tag set and is dropped.
};

function mapTags(names) {
  return [...new Set(names.map((n) => TAG_MAP[n]).filter(Boolean))];
}

async function main() {
  console.log("Fetching from Notion...");
  const [accountPages, periodPages, incomeCategoryPages, incomePages] =
    await Promise.all([
      queryAll(DB.accounts),
      queryAll(DB.periods),
      queryAll(DB.incomeCategories),
      queryAll(DB.income),
    ]);
  console.log(
    `Fetched ${accountPages.length} accounts, ${periodPages.length} periods, ${incomeCategoryPages.length} income categories, ${incomePages.length} income rows`,
  );

  const { data: existingAccounts, error: accErr } = await supabase
    .from("accounts")
    .select("id, name, is_active");
  if (accErr) throw accErr;
  const { data: existingPeriods, error: perErr } = await supabase
    .from("periods")
    .select("id, name");
  if (perErr) throw perErr;
  const { data: existingCategories, error: catErr } = await supabase
    .from("categories")
    .select("id, name, kind");
  if (catErr) throw catErr;

  // Match Notion accounts to already-imported Supabase accounts by (name, is_active) —
  // there are duplicate account names in Notion (e.g. two "Emergency Fund"), and
  // Status disambiguates them the same way the first import script used it.
  const accountIdMap = new Map(); // notion page id -> supabase account id
  for (const page of accountPages) {
    const name = title(page.properties, "Name");
    if (!name) continue;
    const is_active = statusName(page.properties, "Status") !== "Deactivated";
    const match = existingAccounts.find(
      (a) => a.name === name && a.is_active === is_active,
    );
    if (match) accountIdMap.set(page.id, match.id);
  }

  const periodIdMap = new Map(); // notion page id -> supabase period id
  for (const page of periodPages) {
    const name = title(page.properties, "Period Name");
    if (!name) continue;
    const match = existingPeriods.find((p) => p.name === name);
    if (match) periodIdMap.set(page.id, match.id);
  }

  // Income categories: create any that don't already exist as kind='income'.
  const categoryIdMap = new Map(); // notion page id -> supabase category id
  for (const page of incomeCategoryPages) {
    const name = title(page.properties, "Category Name");
    if (!name) continue;
    let match = existingCategories.find(
      (c) => c.name === name && c.kind === "income",
    );
    if (!match) {
      const { data, error } = await supabase
        .from("categories")
        .insert({ name, kind: "income", is_need: false })
        .select("id")
        .single();
      if (error) throw error;
      match = { id: data.id, name, kind: "income" };
      existingCategories.push(match);
    }
    categoryIdMap.set(page.id, match.id);
  }
  console.log(`Resolved ${categoryIdMap.size} income categories`);

  const rows = [];
  for (const page of incomePages) {
    const description = title(page.properties, "Source");
    const amount = number(page.properties, "Amount");
    const txn_date = dateStart(page.properties, "Date");
    const periodPageId = relationId(page.properties, "Month");
    if (!description || amount == null || !txn_date) continue;
    const period_id = periodIdMap.get(periodPageId);
    if (!period_id) continue;

    const accountPageId = relationId(page.properties, "Account");
    const categoryPageId = relationId(page.properties, "Income Category");
    const account_id = accountPageId
      ? (accountIdMap.get(accountPageId) ?? null)
      : null;
    const category_id = categoryPageId
      ? (categoryIdMap.get(categoryPageId) ?? null)
      : null;
    const tags = mapTags(multiSelectNames(page.properties, "Tags"));

    rows.push({
      kind: "income",
      description,
      amount,
      txn_date,
      account_id,
      category_id,
      period_id,
      tags,
    });
  }

  console.log(`Inserting ${rows.length} income transactions...`);
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
