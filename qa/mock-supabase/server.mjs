#!/usr/bin/env node
// A fake Supabase for QA: the subset of PostgREST, GoTrue (auth) and Storage
// that Bailey Budget actually calls, backed by the seed JSON in memory.
//
// Why this exists instead of a real database: the only Supabase project is
// the household's live data, and there's no Docker on this machine for a
// local one. This keeps two years of fake transactions far away from real
// money, resets instantly, and — unlike a real database — can inject the
// network faults the QA checklist needs (slow, dropped, and "the write
// committed but the response never arrived", which is how a retry makes a
// duplicate).
//
//   node mock-supabase/server.mjs [--seed=.data/seed.json] [--port=54321] [--host=127.0.0.1]
//
// Control endpoints (never part of the real API):
//   POST /__qa/reset              reload the seed (optionally {"seed": "path"})
//   GET  /__qa/state              table row counts
//   GET  /__qa/log?since=<n>      recent requests: method, path, status, ms, bytes
//   POST /__qa/faults             {"latencyMs":0,"jitterMs":0,"rules":[...]} (see README)
//   GET  /__qa/table/<name>       raw rows, for assertions
//
// Sessions are ES256 JWTs verified via a published JWKS — the same way
// production verifies them (getClaims() checks locally, no per-request
// round trip), so timing isn't skewed by an extra auth hop.

import { createServer } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TEST_USERS } from "./test-users.mjs";
import { PUBLIC_JWK, signJwt, verifyJwt } from "./keys.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const qaRoot = resolve(here, "..");

function argValue(name, fallback) {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : (process.env[`QA_MOCK_${name.toUpperCase()}`] ?? fallback);
}

const PORT = Number(argValue("port", 54321));
const HOST = argValue("host", "127.0.0.1");
let seedPath = resolve(qaRoot, argValue("seed", ".data/seed.json"));
const PUBLIC_URL = argValue("public-url", `http://${HOST === "0.0.0.0" ? "127.0.0.1" : HOST}:${PORT}`);
// Lets the launcher prove it's talking to THIS process, not a stale one
// still holding the port.
const BOOT_ID = argValue("boot-id", randomUUID());

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

let tables = {};
let seedMeta = {};

// Column defaults for inserts, mirroring supabase/schema.sql + migrations.
const DEFAULTS = {
  accounts: { starting_balance: 0, goal: null, is_active: true, bank: null, sort_order: 0, is_debt: false, low_balance_alert: null, account_type: null, login_url: null, logo_url: null, is_business: false, balance_checked_at: null },
  periods: { budget_locked_at: null, budget_locked_by_email: null, budget_lock_snapshot: null },
  categories: { is_need: false, icon: null, rollover: false, group_name: null, is_active: true },
  budget_lines: { planned_amount: 0 },
  recurring_transactions: { account_id: null, category_id: null, is_active: true, deleted_at: null },
  transactions: { account_id: null, to_account_id: null, category_id: null, created_by: null, created_by_email: null, notes: null, cleared: false, deleted_at: null, receipt_url: null, recurring_transaction_id: null, pending_approval: false },
  transaction_splits: { category_id: null },
  transaction_history: {},
  objectives: { status: "Not Started", start_date: null, end_date: null, notes: null, linked_account_id: null, image_url: null, deleted_at: null },
  api_tokens: { created_by_email: null, last_used_at: null, revoked_at: null },
  profiles: { display_name: null, avatar_url: null, insights_prefs: null },
  loans: {},
  calendar_events: { start_time: null, end_time: null, notes: null, recurrence: "none", assignee: null, created_by: null, created_by_email: null, deleted_at: null },
};

// The constraints the app's own logic leans on (e.g. copyBudgetForward and
// upsertBudgetLine rely on the budget_lines unique key).
const UNIQUE = { budget_lines: [["category_id", "period_id"]], api_tokens: [["token_hash"]] };
const CHECKS = {
  transactions: (r) =>
    !["income", "expense", "transfer"].includes(r.kind)
      ? "transactions_kind_check"
      : r.kind === "transfer" && r.category_id
        ? "transactions_transfer_no_category"
        : null,
  categories: (r) => (!["income", "expense"].includes(r.kind) ? "categories_kind_check" : null),
  recurring_transactions: (r) => (r.day_of_month < 1 || r.day_of_month > 28 ? "recurring_transactions_day_of_month_check" : null),
  calendar_events: (r) =>
    !["none", "weekly"].includes(r.recurrence)
      ? "calendar_events_recurrence_check"
      : r.assignee !== null && r.assignee !== undefined && !["andru", "geralyn", "kids", "family"].includes(r.assignee)
        ? "calendar_events_assignee_check"
        : null,
};

function loadSeed(path = seedPath) {
  seedPath = path;
  const json = JSON.parse(readFileSync(path, "utf8"));
  tables = json.tables;
  seedMeta = json.meta;
  for (const name of Object.keys(DEFAULTS)) tables[name] ??= [];
  tables.avatars ??= [];
}

// ---------------------------------------------------------------------------
// Faults + request log
// ---------------------------------------------------------------------------

let faults = { latencyMs: 0, jitterMs: 0, rules: [] };
const requestLog = [];
let requestSeq = 0;

function matchingRule(method, path) {
  return faults.rules.find(
    (r) =>
      (r.times === undefined || r.times > 0) &&
      (!r.match?.method || r.match.method.toUpperCase() === method) &&
      (!r.match?.path || path.startsWith(r.match.path)),
  );
}

function consumeRule(rule) {
  if (rule && rule.times !== undefined) rule.times -= 1;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// PostgREST filter grammar (the subset postgrest-js emits)
// ---------------------------------------------------------------------------

const RESERVED = new Set(["select", "order", "limit", "offset", "on_conflict", "columns", "or", "and"]);

function splitTopLevel(s, sep = ",") {
  const out = [];
  let depth = 0;
  let quoted = false;
  let cur = "";
  for (const ch of s) {
    if (ch === '"') quoted = !quoted;
    if (!quoted && ch === "(") depth++;
    if (!quoted && ch === ")") depth--;
    if (!quoted && depth === 0 && ch === sep) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

const unquote = (v) => (v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1).replace(/\\"/g, '"') : v);

function coerceCompare(rowVal, raw) {
  if (rowVal === null || rowVal === undefined) return null;
  if (typeof rowVal === "number") {
    const n = Number(raw);
    return Number.isNaN(n) ? null : rowVal - n;
  }
  if (typeof rowVal === "boolean") return rowVal === (raw === "true") ? 0 : 1;
  const a = String(rowVal);
  const isTs = (x) => /^\d{4}-\d{2}-\d{2}T/.test(x);
  if ((isTs(a) || isTs(raw)) && !Number.isNaN(Date.parse(a)) && !Number.isNaN(Date.parse(raw))) {
    return Date.parse(a) - Date.parse(raw.length === 10 ? `${raw}T00:00:00Z` : raw);
  }
  return a < raw ? -1 : a > raw ? 1 : 0;
}

function likeRegex(pattern, flags) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/[%*]/g, ".*").replace(/_/g, ".");
  return new RegExp(`^${escaped}$`, flags);
}

// "eq.5", "not.is.null", "in.(a,b)", "ilike.*foo*" -> predicate(row)
function operatorPredicate(column, expr) {
  let negate = false;
  if (expr.startsWith("not.")) {
    negate = true;
    expr = expr.slice(4);
  }
  const dot = expr.indexOf(".");
  const op = expr.slice(0, dot);
  const raw = expr.slice(dot + 1);
  let test;
  switch (op) {
    case "eq":
      test = (r) => coerceCompare(r[column], unquote(raw)) === 0;
      break;
    case "neq":
      test = (r) => { const c = coerceCompare(r[column], unquote(raw)); return c !== null && c !== 0; };
      break;
    case "gt":
      test = (r) => { const c = coerceCompare(r[column], unquote(raw)); return c !== null && c > 0; };
      break;
    case "gte":
      test = (r) => { const c = coerceCompare(r[column], unquote(raw)); return c !== null && c >= 0; };
      break;
    case "lt":
      test = (r) => { const c = coerceCompare(r[column], unquote(raw)); return c !== null && c < 0; };
      break;
    case "lte":
      test = (r) => { const c = coerceCompare(r[column], unquote(raw)); return c !== null && c <= 0; };
      break;
    case "like":
    case "ilike": {
      const re = likeRegex(unquote(raw), op === "ilike" ? "i" : "");
      test = (r) => typeof r[column] === "string" && re.test(r[column]);
      break;
    }
    case "is":
      test = (r) => (raw === "null" ? r[column] === null || r[column] === undefined : r[column] === (raw === "true"));
      break;
    case "in": {
      const values = splitTopLevel(raw.replace(/^\(/, "").replace(/\)$/, "")).map(unquote);
      test = (r) => values.some((v) => coerceCompare(r[column], v) === 0);
      break;
    }
    case "cs": {
      const want = raw.replace(/^[{[]/, "").replace(/[}\]]$/, "").split(",").map(unquote);
      test = (r) => Array.isArray(r[column]) && want.every((w) => r[column].map(String).includes(w));
      break;
    }
    default:
      throw Object.assign(new Error(`mock: unsupported operator "${op}" on ${column}`), { status: 400, code: "PGRST100" });
  }
  return negate ? (r) => !test(r) : test;
}

// or=(a.eq.1,b.ilike.*x*,c.in.(u,v))
function orPredicate(expr) {
  const inner = expr.replace(/^\(/, "").replace(/\)$/, "");
  const parts = splitTopLevel(inner).map((part) => {
    const dot = part.indexOf(".");
    return operatorPredicate(part.slice(0, dot), part.slice(dot + 1));
  });
  return (r) => parts.some((p) => p(r));
}

function buildFilter(params) {
  const preds = [];
  for (const [key, value] of params) {
    if (key === "or") preds.push(orPredicate(value));
    else if (!RESERVED.has(key)) preds.push(operatorPredicate(key, value));
  }
  return (r) => preds.every((p) => p(r));
}

function applyOrder(rows, orderParam) {
  if (!orderParam) return rows;
  const specs = orderParam.split(",").map((s) => {
    const [col, ...mods] = s.split(".");
    const desc = mods.includes("desc");
    const nullsFirst = mods.includes("nullsfirst") ? true : mods.includes("nullslast") ? false : desc;
    return { col, desc, nullsFirst };
  });
  return rows.slice().sort((a, b) => {
    for (const { col, desc, nullsFirst } of specs) {
      const av = a[col];
      const bv = b[col];
      if (av == null && bv == null) continue;
      if (av == null) return nullsFirst ? -1 : 1;
      if (bv == null) return nullsFirst ? 1 : -1;
      const c = typeof av === "number" && typeof bv === "number" ? av - bv : String(av) < String(bv) ? -1 : String(av) > String(bv) ? 1 : 0;
      if (c !== 0) return desc ? -c : c;
    }
    return 0;
  });
}

function project(row, select) {
  if (!select || select.trim() === "*") return { ...row };
  const out = {};
  for (const raw of splitTopLevel(select)) {
    const part = raw.trim().replace(/::\w+$/, "");
    if (part === "*") Object.assign(out, row);
    else if (part.includes(":")) {
      const [alias, col] = part.split(":");
      out[alias] = row[col];
    } else out[part] = row[part] ?? null;
  }
  return out;
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function corsHeaders(req) {
  return {
    "access-control-allow-origin": req.headers.origin ?? "*",
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,HEAD,OPTIONS",
    "access-control-allow-headers":
      "authorization,apikey,content-type,prefer,range,range-unit,accept-profile,content-profile,x-client-info,x-supabase-api-version,x-upsert,cache-control",
    "access-control-expose-headers": "content-range,content-location,x-supabase-api-version",
    "access-control-max-age": "600",
  };
}

function send(res, req, status, body, extraHeaders = {}) {
  const headers = { ...corsHeaders(req), ...extraHeaders };
  let payload = "";
  if (body !== undefined && body !== null) {
    payload = typeof body === "string" ? body : JSON.stringify(body);
    headers["content-type"] ??= "application/json; charset=utf-8";
  }
  res.writeHead(status, headers);
  res.end(req.method === "HEAD" ? undefined : payload);
  return Buffer.byteLength(payload);
}

function pgError(status, code, message, details = null) {
  return Object.assign(new Error(message), { status, code, details });
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks);
  const type = req.headers["content-type"] ?? "";
  if (!raw.length) return null;
  if (type.includes("application/json")) return JSON.parse(raw.toString("utf8"));
  if (type.includes("application/x-www-form-urlencoded")) return Object.fromEntries(new URLSearchParams(raw.toString("utf8")));
  return raw;
}

function prefer(req) {
  const out = {};
  for (const part of (req.headers.prefer ?? "").split(",")) {
    const [k, v] = part.trim().split("=");
    if (k) out[k] = v ?? true;
  }
  return out;
}

// Who is calling: a signed-in user, the service role, or anon.
function caller(req) {
  const bearer = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  const claims = verifyJwt(bearer) ?? verifyJwt(req.headers.apikey);
  if (!claims) return { role: "invalid" };
  return { role: claims.role, sub: claims.sub ?? null, email: claims.email ?? null };
}

// ---------------------------------------------------------------------------
// Auth (GoTrue subset)
// ---------------------------------------------------------------------------

const refreshTokens = new Map();

function userObject(u) {
  const now = new Date().toISOString();
  return {
    id: u.id,
    aud: "authenticated",
    role: "authenticated",
    email: u.email,
    email_confirmed_at: "2024-09-01T12:00:00Z",
    phone: "",
    confirmed_at: "2024-09-01T12:00:00Z",
    last_sign_in_at: now,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { display_name: u.display_name },
    identities: [],
    created_at: "2024-09-01T12:00:00Z",
    updated_at: now,
    is_anonymous: false,
  };
}

function issueSession(u) {
  const iat = Math.floor(Date.now() / 1000);
  const expiresIn = 3600;
  const sessionId = randomUUID();
  const access = signJwt({
    iss: `${PUBLIC_URL}/auth/v1`,
    aud: "authenticated",
    sub: u.id,
    email: u.email,
    phone: "",
    role: "authenticated",
    aal: "aal1",
    amr: [{ method: "password", timestamp: iat }],
    session_id: sessionId,
    is_anonymous: false,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { display_name: u.display_name },
    iat,
    exp: iat + expiresIn,
  });
  const refresh = randomBytes(24).toString("base64url");
  refreshTokens.set(refresh, u.id);
  return { access_token: access, token_type: "bearer", expires_in: expiresIn, expires_at: iat + expiresIn, refresh_token: refresh, user: userObject(u) };
}

const usersById = () => new Map(Object.values(TEST_USERS).map((u) => [u.id, u]));

async function handleAuth(req, res, url) {
  const path = url.pathname.replace(/^\/auth\/v1/, "");
  if (path === "/.well-known/jwks.json") return send(res, req, 200, { keys: [PUBLIC_JWK] });
  if (path === "/settings") return send(res, req, 200, { external: { email: true }, disable_signup: true, autoconfirm: true });
  if (path === "/health") return send(res, req, 200, { name: "GoTrue (QA mock)" });

  if (path === "/token" && req.method === "POST") {
    const body = (await readBody(req)) ?? {};
    const grant = url.searchParams.get("grant_type");
    if (grant === "password") {
      const u = Object.values(TEST_USERS).find((x) => x.email === String(body.email ?? "").toLowerCase());
      if (!u || u.password !== body.password) {
        return send(res, req, 400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
      }
      return send(res, req, 200, issueSession(u));
    }
    if (grant === "refresh_token") {
      const userId = refreshTokens.get(body.refresh_token);
      if (!userId) return send(res, req, 400, { code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token: Refresh Token Not Found" });
      refreshTokens.delete(body.refresh_token);
      return send(res, req, 200, issueSession(usersById().get(userId)));
    }
    return send(res, req, 400, { code: 400, error_code: "unsupported_grant_type", msg: `grant_type ${grant} not supported by the QA mock` });
  }

  if (path === "/user") {
    const who = caller(req);
    const u = who.sub ? usersById().get(who.sub) : null;
    if (!u) return send(res, req, 401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
    if (req.method === "PUT") {
      const body = (await readBody(req)) ?? {};
      if (body.password) u.password = body.password;
      if (body.data?.display_name) u.display_name = body.data.display_name;
    }
    return send(res, req, 200, userObject(u));
  }

  if (path === "/logout" && req.method === "POST") return send(res, req, 204, null);

  return send(res, req, 404, { code: 404, msg: `QA mock: auth route ${req.method} ${path} not implemented` });
}

// ---------------------------------------------------------------------------
// PostgREST
// ---------------------------------------------------------------------------

function checkRow(table, row) {
  const violated = CHECKS[table]?.(row);
  if (violated) throw pgError(400, "23514", `new row for relation "${table}" violates check constraint "${violated}"`);
}

function findConflict(table, row, keys) {
  return tables[table].find((existing) => existing !== row && keys.every((k) => existing[k] === row[k]));
}

function assertUnique(table, row) {
  for (const keys of UNIQUE[table] ?? []) {
    if (keys.every((k) => row[k] !== undefined && row[k] !== null) && findConflict(table, row, keys)) {
      throw pgError(409, "23505", `duplicate key value violates unique constraint "${table}_${keys.join("_")}_key"`, `Key (${keys.join(", ")}) already exists.`);
    }
  }
  if (tables[table].some((r) => r !== row && r.id === row.id)) {
    throw pgError(409, "23505", `duplicate key value violates unique constraint "${table}_pkey"`);
  }
}

function withDefaults(table, input) {
  const now = new Date().toISOString();
  const row = { id: randomUUID(), ...DEFAULTS[table], ...input };
  if (table !== "profiles" && table !== "loans" && !("created_at" in input)) row.created_at = now;
  if (table === "transactions" && !("updated_at" in input)) row.updated_at = row.created_at ?? now;
  if (table === "profiles" && !("updated_at" in input)) row.updated_at = now;
  return row;
}

// RLS as deployed: any authenticated user reads/writes everything; profiles
// are readable by all but writable only by their owner; anon sees nothing.
function authorize(table, who, method, row) {
  if (who.role === "service_role") return true;
  if (who.role !== "authenticated") return false;
  if (table === "profiles" && method !== "GET" && row && row.id !== who.sub) return false;
  return true;
}

async function handleRest(req, res, url, rule) {
  const table = decodeURIComponent(url.pathname.replace(/^\/rest\/v1\//, "").split("/")[0]);
  if (!tables[table]) throw pgError(404, "PGRST205", `Could not find the table 'public.${table}' in the schema cache`);
  const who = caller(req);
  if (who.role === "invalid") throw pgError(401, "PGRST301", "JWSError JWSInvalidSignature");
  const params = [...url.searchParams.entries()];
  const filter = buildFilter(params);
  const pref = prefer(req);
  const wantsObject = (req.headers.accept ?? "").includes("application/vnd.pgrst.object+json");
  const select = url.searchParams.get("select");
  const returning = pref.return === "representation";

  const respondRows = (status, rows, extra = {}) => {
    if (wantsObject) {
      if (rows.length !== 1) {
        throw pgError(406, "PGRST116", "JSON object requested, multiple (or no) rows returned", `The result contains ${rows.length} rows`);
      }
      return send(res, req, status, rows[0], extra);
    }
    return send(res, req, status, rows, extra);
  };

  if (req.method === "GET" || req.method === "HEAD") {
    const visible = authorize(table, who, "GET") ? tables[table] : [];
    let rows = applyOrder(visible.filter(filter), url.searchParams.get("order"));
    const total = rows.length;
    let from = Number(url.searchParams.get("offset") ?? 0);
    let to = url.searchParams.get("limit") !== null ? from + Number(url.searchParams.get("limit")) - 1 : rows.length - 1;
    const range = req.headers.range?.match(/^(\d+)-(\d+)$/);
    if (range) {
      from = Number(range[1]);
      to = Math.min(to, Number(range[2]));
    }
    rows = rows.slice(from, to + 1).map((r) => project(r, select));
    const extra = {};
    if (pref.count) extra["content-range"] = `${rows.length ? `${from}-${from + rows.length - 1}` : "*"}/${total}`;
    return respondRows(200, rows, extra);
  }

  const body = await readBody(req);

  if (req.method === "POST") {
    const inputs = Array.isArray(body) ? body : [body];
    const upsert = pref.resolution === "merge-duplicates" || pref.resolution === "ignore-duplicates";
    const conflictKeys = (url.searchParams.get("on_conflict") ?? "id").split(",");
    const staged = [];
    const snapshot = tables[table].slice();
    const merged = [];
    try {
      for (const input of inputs) {
        if (!authorize(table, who, "POST", input)) throw pgError(403, "42501", `new row violates row-level security policy for table "${table}"`);
        const existing = upsert && conflictKeys.every((k) => input[k] !== undefined) ? tables[table].find((r) => conflictKeys.every((k) => r[k] === input[k])) : null;
        if (existing) {
          if (pref.resolution === "merge-duplicates") {
            merged.push([existing, { ...existing }]);
            Object.assign(existing, input);
            checkRow(table, existing);
            staged.push(existing);
          }
          continue;
        }
        const row = withDefaults(table, input);
        checkRow(table, row);
        tables[table].push(row);
        assertUnique(table, row);
        staged.push(row);
      }
    } catch (e) {
      // The statement is atomic, like Postgres: undo inserts and merges.
      tables[table] = snapshot;
      for (const [row, before] of merged) Object.assign(row, before);
      throw e;
    }
    if (rule?.action === "drop-after-commit") return "drop";
    return returning ? respondRows(201, staged.map((r) => project(r, select))) : send(res, req, 201, null);
  }

  if (req.method === "PATCH") {
    const targets = tables[table].filter(filter);
    for (const row of targets) {
      if (!authorize(table, who, "PATCH", { ...row, ...body })) throw pgError(403, "42501", `new row violates row-level security policy for table "${table}"`);
    }
    const before = targets.map((r) => ({ ...r }));
    try {
      for (const row of targets) {
        Object.assign(row, body);
        checkRow(table, row);
        assertUnique(table, row);
      }
    } catch (e) {
      targets.forEach((row, i) => Object.assign(row, before[i]));
      throw e;
    }
    if (rule?.action === "drop-after-commit") return "drop";
    return returning ? respondRows(200, targets.map((r) => project(r, select))) : send(res, req, 204, null);
  }

  if (req.method === "DELETE") {
    const targets = tables[table].filter(filter);
    if (targets.some((r) => !authorize(table, who, "DELETE", r))) throw pgError(403, "42501", `permission denied for table "${table}"`);
    tables[table] = tables[table].filter((r) => !targets.includes(r));
    if (rule?.action === "drop-after-commit") return "drop";
    return returning ? respondRows(200, targets.map((r) => project(r, select))) : send(res, req, 204, null);
  }

  throw pgError(405, "PGRST117", `Unsupported HTTP method: ${req.method}`);
}

// ---------------------------------------------------------------------------
// Storage (just enough for avatar/logo uploads to not explode)
// ---------------------------------------------------------------------------

const objects = new Map();
async function handleStorage(req, res, url) {
  const m = url.pathname.match(/^\/storage\/v1\/object\/(?:public\/)?([^/]+)\/(.+)$/);
  if (!m) return send(res, req, 404, { statusCode: "404", error: "not_found", message: "QA mock: storage route not implemented" });
  const key = `${m[1]}/${decodeURIComponent(m[2])}`;
  if (req.method === "POST" || req.method === "PUT") {
    objects.set(key, { body: await readBody(req), type: req.headers["content-type"] ?? "application/octet-stream" });
    return send(res, req, 200, { Key: key, Id: randomUUID() });
  }
  if (req.method === "GET" && objects.has(key)) {
    const obj = objects.get(key);
    res.writeHead(200, { ...corsHeaders(req), "content-type": obj.type });
    res.end(obj.body);
    return Buffer.byteLength(obj.body ?? "");
  }
  if (req.method === "DELETE") {
    objects.delete(key);
    return send(res, req, 200, []);
  }
  return send(res, req, 404, { statusCode: "404", error: "not_found", message: "Object not found" });
}

// ---------------------------------------------------------------------------
// Control plane
// ---------------------------------------------------------------------------

async function handleControl(req, res, url) {
  const path = url.pathname;
  if (path === "/__qa/reset" && req.method === "POST") {
    const body = (await readBody(req)) ?? {};
    loadSeed(body.seed ? resolve(qaRoot, body.seed) : seedPath);
    requestLog.length = 0;
    faults = { latencyMs: 0, jitterMs: 0, rules: [] };
    return send(res, req, 200, { ok: true, seed: seedPath, meta: seedMeta });
  }
  if (path === "/__qa/state") {
    return send(res, req, 200, { bootId: BOOT_ID, seed: seedPath, meta: seedMeta, counts: Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length])), faults });
  }
  if (path === "/__qa/log") {
    const since = Number(url.searchParams.get("since") ?? 0);
    return send(res, req, 200, requestLog.filter((r) => r.seq > since));
  }
  if (path === "/__qa/faults" && req.method === "POST") {
    faults = { latencyMs: 0, jitterMs: 0, rules: [], ...((await readBody(req)) ?? {}) };
    return send(res, req, 200, faults);
  }
  if (path.startsWith("/__qa/table/")) {
    const name = path.slice("/__qa/table/".length);
    return send(res, req, tables[name] ? 200 : 404, tables[name] ?? { error: `no table ${name}` });
  }
  return send(res, req, 404, { error: "unknown control route" });
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

loadSeed();

const server = createServer(async (req, res) => {
  const started = performance.now();
  const url = new URL(req.url, PUBLIC_URL);
  const seq = ++requestSeq;
  let status = 0;
  let bytes = 0;
  const log = (extra = {}) => {
    requestLog.push({ seq, at: new Date().toISOString(), method: req.method, path: url.pathname, query: url.search, status, ms: Math.round((performance.now() - started) * 10) / 10, bytes, ...extra });
    if (requestLog.length > 5000) requestLog.splice(0, requestLog.length - 5000);
  };

  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders(req));
    return res.end();
  }
  if (url.pathname.startsWith("/__qa/")) {
    try {
      await handleControl(req, res, url);
    } catch (e) {
      send(res, req, 500, { error: String(e?.message ?? e) });
    }
    return;
  }

  // Network faults apply to the real API surface only.
  const rule = matchingRule(req.method, url.pathname);
  const delay = faults.latencyMs + Math.random() * faults.jitterMs + (rule?.action === "delay" ? (rule.delayMs ?? 3000) : 0);
  if (delay > 0) await sleep(delay);
  if (rule && rule.action === "drop") {
    consumeRule(rule);
    status = -1;
    log({ fault: "drop" });
    return req.socket.destroy();
  }
  if (rule && rule.action === "error500") {
    consumeRule(rule);
    status = 500;
    bytes = send(res, req, 500, { code: "XX000", message: "QA mock: injected server error" });
    return log({ fault: "error500" });
  }

  try {
    let outcome;
    if (url.pathname.startsWith("/auth/v1")) outcome = await handleAuth(req, res, url);
    else if (url.pathname.startsWith("/rest/v1/")) outcome = await handleRest(req, res, url, rule);
    else if (url.pathname.startsWith("/storage/v1/")) outcome = await handleStorage(req, res, url);
    else outcome = send(res, req, 404, { message: `QA mock: ${url.pathname} not implemented` });
    if (outcome === "drop") {
      consumeRule(rule);
      status = -1;
      log({ fault: "drop-after-commit" });
      return req.socket.destroy();
    }
    if (rule?.action === "delay") consumeRule(rule);
    status = res.statusCode;
    bytes = typeof outcome === "number" ? outcome : 0;
  } catch (e) {
    status = e.status ?? 500;
    bytes = send(res, req, status, { code: e.code ?? "XX000", details: e.details ?? null, hint: null, message: e.message });
  }
  log();
});

server.on("error", (e) => {
  console.error(`QA mock failed to start: ${e.message}`);
  process.exit(1);
});
server.listen(PORT, HOST, () => {
  console.log(`QA mock Supabase on ${PUBLIC_URL} (listening ${HOST}:${PORT})`);
  console.log(`  seed: ${seedPath} (${seedMeta.live_transactions} live transactions, as-of ${seedMeta.as_of}, scale ${seedMeta.scale})`);
});
