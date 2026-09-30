#!/usr/bin/env node
// Compatibility check for the QA mock, driven by the app's OWN installed
// @supabase/supabase-js (resolved from the repo's node_modules), so it
// exercises exactly the client code paths the app runs. Start the mock
// first: node mock-supabase/server.mjs, then: node mock-supabase/smoke.mjs

import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ANON_KEY, SERVICE_ROLE_KEY } from "./keys.mjs";
import { TEST_USERS } from "./test-users.mjs";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const { createClient } = createRequire(resolve(appRoot, "package.json"))("@supabase/supabase-js");
const URL_ = process.env.QA_MOCK_URL ?? "http://127.0.0.1:54321";

let failed = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed++;
}

await fetch(`${URL_}/__qa/reset`, { method: "POST" });

const admin = createClient(URL_, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const user = createClient(URL_, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

// --- auth ---
const bad = await user.auth.signInWithPassword({ email: TEST_USERS.andru.email, password: "wrong" });
check("wrong password rejected", Boolean(bad.error));
const { data: signIn, error: signInError } = await user.auth.signInWithPassword({ email: TEST_USERS.andru.email, password: TEST_USERS.andru.password });
check("password sign-in", !signInError && signIn.session?.access_token, signInError?.message);
const claims = await user.auth.getClaims();
check("getClaims verifies ES256 via JWKS", claims.data?.claims?.sub === TEST_USERS.andru.id, claims.error?.message);
const got = await user.auth.getUser();
check("getUser", got.data?.user?.email === TEST_USERS.andru.email, got.error?.message);

// --- anon sees nothing (RLS "to authenticated") ---
const anon = createClient(URL_, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const anonRows = await anon.from("transactions").select("*").limit(5);
check("anon reads nothing", !anonRows.error && anonRows.data.length === 0);

// --- snapshot.ts's whole-table paging pattern ---
const first = await admin.from("transactions").select("*", { count: "exact" }).order("id", { ascending: true }).range(0, 999);
check("count exact + range page", !first.error && first.data.length === 1000 && first.count > 1000, `${first.data?.length} rows, count ${first.count}`);
const head = await admin.from("transactions").select("*", { count: "exact", head: true }).is("deleted_at", null);
check("head count", !head.error && typeof head.count === "number" && head.count < first.count, `live ${head.count} of ${first.count}`);

// --- filters the app uses ---
const period = (await admin.from("periods").select("*").order("start_date", { ascending: false }).limit(1).single()).data;
check("order + limit + single", Boolean(period?.id), period?.name);
const inPeriod = await user.from("transactions").select("id, kind, amount, account_id").eq("period_id", period.id).is("deleted_at", null);
check("eq + is null + projection", !inPeriod.error && inPeriod.data.length > 0 && Object.keys(inPeriod.data[0]).length === 4, `${inPeriod.data?.length} rows`);
const range = await user.from("transactions").select("id").gte("txn_date", period.start_date).lte("txn_date", period.end_date).neq("kind", "transfer");
check("gte/lte/neq", !range.error && range.data.length > 0, `${range.data?.length} rows`);
const ids = inPeriod.data.slice(0, 3).map((r) => r.id);
const inIds = await user.from("transactions").select("id").in("id", ids);
check("in()", inIds.data?.length === ids.length);
const search = await user.from("transactions").select("id, description").or("description.ilike.%publix%,notes.ilike.%publix%").is("deleted_at", null).order("txn_date", { ascending: false }).limit(20);
check("or() with ilike", !search.error && search.data.length > 0 && search.data.every((r) => /publix/i.test(r.description)), `${search.data?.length} hits`);
const none = await user.from("transactions").select("id").eq("id", "00000000-0000-0000-0000-000000000000").maybeSingle();
check("maybeSingle with no row", !none.error && none.data === null, none.error?.message);
const multi = await user.from("transactions").select("id").eq("period_id", period.id).single();
check("single() with many rows errors PGRST116", multi.error?.code === "PGRST116");
const notNull = await user.from("transactions").select("id").not("recurring_transaction_id", "is", null).limit(3);
check("not is null", !notNull.error && notNull.data.length === 3);

// --- writes ---
const cat = (await user.from("categories").select("id").eq("name", "Groceries").single()).data;
const acct = (await user.from("accounts").select("id").eq("name", "Personal Checking").single()).data;
const inserted = await user
  .from("transactions")
  .insert({ kind: "expense", description: "QA smoke insert", amount: 12.34, txn_date: period.start_date, account_id: acct.id, category_id: cat.id, period_id: period.id, created_by: TEST_USERS.andru.id, created_by_email: TEST_USERS.andru.email })
  .select()
  .single();
check("insert().select().single() with defaults", !inserted.error && inserted.data.cleared === false && inserted.data.deleted_at === null && Boolean(inserted.data.created_at), inserted.error?.message);
const updated = await user.from("transactions").update({ amount: 43.21 }).eq("id", inserted.data.id).select().single();
check("update().eq().select().single()", updated.data?.amount === 43.21);
const transferWithCategory = await user.from("transactions").insert({ kind: "transfer", description: "bad", amount: 1, txn_date: period.start_date, account_id: acct.id, to_account_id: acct.id, category_id: cat.id, period_id: period.id });
check("check constraint: transfer can't carry a category", transferWithCategory.error?.code === "23514");
const upsert1 = await user.from("budget_lines").upsert({ category_id: cat.id, period_id: period.id, planned_amount: 999 }, { onConflict: "category_id,period_id" });
const line = await user.from("budget_lines").select("planned_amount").eq("category_id", cat.id).eq("period_id", period.id);
check("upsert onConflict merges (no duplicate line)", !upsert1.error && line.data.length === 1 && line.data[0].planned_amount === 999);
const dupLine = await user.from("budget_lines").insert({ category_id: cat.id, period_id: period.id, planned_amount: 1 });
check("unique (category_id, period_id) enforced", dupLine.error?.code === "23505");
const del = await user.from("transactions").delete().eq("id", inserted.data.id);
check("delete", !del.error);

// --- profiles RLS: own row only ---
const ownProfile = await user.from("profiles").update({ display_name: "Andru" }).eq("id", TEST_USERS.andru.id);
const otherProfile = await user.from("profiles").update({ display_name: "hacked" }).eq("id", TEST_USERS.geralyn.id);
check("profiles: own row writable, other's not", !ownProfile.error && otherProfile.error?.code === "42501");

// --- the retry-duplicate fault ---
await fetch(`${URL_}/__qa/faults`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ rules: [{ match: { method: "POST", path: "/rest/v1/transactions" }, action: "drop-after-commit", times: 1 }] }),
});
const dropped = await user.from("transactions").insert({ kind: "expense", description: "QA fault probe", amount: 5, txn_date: period.start_date, account_id: acct.id, category_id: cat.id, period_id: period.id });
const landed = await admin.from("transactions").select("id").eq("description", "QA fault probe");
check("drop-after-commit: client sees failure but row landed", Boolean(dropped.error) && landed.data?.length === 1, `client error: ${dropped.error?.message}`);

await fetch(`${URL_}/__qa/reset`, { method: "POST" });
console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll mock compatibility checks passed.");
process.exit(failed ? 1 : 0);
