#!/usr/bin/env node
// Turns a profiling run into numbers. Reads .profile/latest.json and the
// latest-cpu-*.cpuprofile files written by /api/profile?op=ui, plus
// .profile/browse.json if a browse capture was saved.
//
//   npm run build && npm run profile:start     (PROFILE=1, port 3100)
//   open http://localhost:3100/api/profile?op=ui, run the pass
//   npm run profile:report                     (add --json for raw output)
//
// Every figure comes from a span or a CPU sample; nothing is estimated
// except where a line says "allocated", which splits one measured bucket by
// measured CPU proportions.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AnyMap, originalPositionFor } from "@jridgewell/trace-mapping";

const DIR = path.join(process.cwd(), ".profile");
const asJson = process.argv.includes("--json");

const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const median = (xs) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const ms = (v) => `${v.toFixed(1)}ms`;
const pct = (part, whole) => (whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "—");
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);

function readJson(file) {
  const full = path.join(DIR, file);
  return fs.existsSync(full) ? JSON.parse(fs.readFileSync(full, "utf8")) : null;
}

const results = readJson("latest.json");
if (!results) {
  console.error("No .profile/latest.json — run the pass at /api/profile?op=ui first.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Wall-clock breakdown of one request, from its spans.
// ---------------------------------------------------------------------------

const pathOf = (requestName) => requestName.split(" ")[1].split("?")[0];

function breakdown(req) {
  const of = (cat) => req.spans.filter((s) => s.cat === cat);
  const requestSpan = of("request").filter((s) => pathOf(s.name) === req.route).at(-1);
  const serverMs = requestSpan?.ms ?? NaN;

  const supabase = of("supabase");
  const authCalls = supabase.filter((s) => s.name.includes("/auth/v1"));
  const dataCalls = supabase.filter((s) => !s.name.includes("/auth/v1"));
  const upstream = (calls) => sum(calls.map((s) => s.meta?.upstreamMs ?? 0));

  const proxyMs = sum(of("proxy").map((s) => s.ms));
  const authMs = sum(of("auth").map((s) => s.ms));
  const tableFetchMs = sum(of("table-fetch").map((s) => s.ms));
  const cacheMs = sum(of("cache").map((s) => s.ms));
  const queryMs = sum(of("query").map((s) => s.ms));

  const parts = {
    // Supabase's own processing time (PostgREST + Postgres) for data reads
    // and writes, and for any auth calls the proxy made.
    db: upstream(dataCalls) + upstream(authCalls),
    // Round trip to Supabase minus its processing time: TLS, RTT, download.
    network: sum(dataCalls.map((s) => s.ms)) - upstream(dataCalls) + sum(authCalls.map((s) => s.ms)) - upstream(authCalls),
    // Whole-table fetch minus its HTTP calls: supabase-js JSON parse + concat.
    responseParse: Math.max(0, tableFetchMs - sum(dataCalls.filter(() => tableFetchMs > 0).map((s) => s.ms))),
    // getTable() minus any fetch inside it: Data Cache read + deserialize
    // (+ serialize-and-store on a miss).
    cacheDeserialize: Math.max(0, cacheMs - tableFetchMs),
    // In-memory snapshot queries: filter/sort/slice over cached rows.
    snapshotQueries: queryMs,
    // JWT verification and cookie handling in the proxy (no network).
    authLocal: Math.max(0, authMs - sum(authCalls.map((s) => s.ms))),
    proxyOther: Math.max(0, proxyMs - authMs),
  };
  const spanned = proxyMs + cacheMs + queryMs;
  // Everything in the request not inside a span: component rendering, data
  // shaping in lib/queries.ts, RSC/HTML serialization, and Next itself.
  parts.renderAndFramework = Math.max(0, serverMs - spanned);

  return {
    serverMs,
    clientMs: req.clientMs,
    localNetworkMs: req.clientMs - serverMs,
    bytes: req.bytes,
    parts,
    counts: {
      queries: of("query").length,
      tablesRead: of("cache").length,
      cacheMisses: of("cache").filter((s) => s.meta?.miss).length,
      supabaseCalls: dataCalls.length,
    },
  };
}

// ---------------------------------------------------------------------------
// CPU attribution from a .cpuprofile, via the server bundles' source maps.
// ---------------------------------------------------------------------------

const tracers = new Map();
function tracerFor(url) {
  if (!url.startsWith("file://")) return null;
  const file = fileURLToPath(url);
  if (!tracers.has(file)) {
    let tracer = null;
    try {
      tracer = new AnyMap(JSON.parse(fs.readFileSync(`${file}.map`, "utf8")), file);
    } catch {
      tracer = null;
    }
    tracers.set(file, tracer);
  }
  return tracers.get(file);
}

function classifySource(source) {
  const s = source.replaceAll("\\", "/");
  if (s.includes("react-server-dom")) return "RSC serialization";
  if (s.includes("react-dom")) return "HTML render (react-dom)";
  if (/compiled\/react\/|node_modules\/react\//.test(s)) return "React runtime";
  if (s.includes("@supabase/")) return "supabase-js";
  if (/undici|node:/.test(s)) return "Node I/O";
  if (/(^|\/)lib\/snapshot\.ts$/.test(s)) return "snapshot queries";
  if (/(^|\/)lib\/perf(-server)?\.ts$/.test(s)) return "profiler overhead";
  if (/(^|\/)lib\//.test(s) && !s.includes("node_modules")) return "data shaping (lib/)";
  if (/(^|\/)app\//.test(s) && !s.includes("node_modules")) return "components (app/)";
  if (s.includes("next/") || s.includes(".next/") || s.includes("node_modules/src/") || s.includes("[turbopack]")) return "Next.js framework";
  if (s.includes("node_modules")) return "other dependencies";
  return "other";
}

function frameCategory(frame) {
  const { functionName, url, lineNumber, columnNumber } = frame;
  if (functionName === "(idle)") return "idle";
  if (functionName === "(garbage collector)") return "garbage collection";
  if (functionName === "(program)") return "V8 native";
  if (!url) return null; // a builtin: attributed to its caller below
  if (url.startsWith("node:")) return "Node I/O";
  const tracer = tracerFor(url);
  if (tracer) {
    const pos = originalPositionFor(tracer, { line: lineNumber + 1, column: columnNumber });
    if (pos.source) return classifySource(pos.source);
  }
  return classifySource(url);
}

function cpuBreakdown(profile) {
  const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);

  const categoryCache = new Map();
  function categoryOf(id) {
    if (categoryCache.has(id)) return categoryCache.get(id);
    const node = nodes.get(id);
    let cat = frameCategory(node.callFrame);
    const isJson = !node.callFrame.url && /^(parse|stringify)$/.test(node.callFrame.functionName);
    if (cat === null) {
      const p = parent.get(id);
      const inherited = p === undefined ? "V8 native" : categoryOf(p);
      cat = isJson ? `JSON ${node.callFrame.functionName} (under ${inherited.replace(/^JSON \w+ \(under (.*)\)$/, "$1")})` : inherited;
    }
    categoryCache.set(id, cat);
    return cat;
  }

  const totals = {};
  const { samples, timeDeltas } = profile;
  for (let i = 0; i < samples.length; i++) {
    const dt = (timeDeltas[i + 1] ?? 0) / 1000;
    const cat = categoryOf(samples[i]);
    totals[cat] = (totals[cat] ?? 0) + dt;
  }
  return totals;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const report = { meta: { startedAt: results.startedAt, runs: results.runs, coldRuns: results.coldRuns }, routes: {} };
const lines = [];
const out = (s = "") => lines.push(s);

const PART_LABELS = {
  authLocal: "auth (JWT verify, proxy)",
  proxyOther: "proxy other",
  db: "database (Supabase upstream)",
  network: "network to Supabase",
  responseParse: "response parse (supabase-js)",
  cacheDeserialize: "cache read + deserialize",
  snapshotQueries: "snapshot queries (compute)",
  renderAndFramework: "render + serialize + framework",
};

function summarize(requests) {
  const bds = requests.map(breakdown);
  const parts = {};
  for (const key of Object.keys(PART_LABELS)) parts[key] = median(bds.map((b) => b.parts[key]));
  return {
    n: bds.length,
    serverMs: median(bds.map((b) => b.serverMs)),
    clientMs: median(bds.map((b) => b.clientMs)),
    localNetworkMs: median(bds.map((b) => b.localNetworkMs)),
    bytes: median(bds.map((b) => b.bytes)),
    parts,
    counts: {
      queries: median(bds.map((b) => b.counts.queries)),
      tablesRead: median(bds.map((b) => b.counts.tablesRead)),
      cacheMisses: median(bds.map((b) => b.counts.cacheMisses)),
      supabaseCalls: median(bds.map((b) => b.counts.supabaseCalls)),
    },
  };
}

out(`Profile run ${results.startedAt} — ${results.runs} warm runs per route/mode, ${results.coldRuns} cold`);
out("All figures are medians per request. Server time = request arrival to last byte.");

for (const route of results.routes) {
  const byPhase = (phase, mode) => results.requests.filter((r) => r.route === route && r.phase === phase && (!mode || r.mode === mode));
  const warmDoc = summarize(byPhase("warm", "document"));
  const warmRsc = summarize(byPhase("warm", "rsc"));
  const cold = summarize(byPhase("cold", "rsc"));
  report.routes[route] = { warmDocument: warmDoc, warmRsc, cold };

  out("");
  out(`━━ ${route} ━━`);
  out(`${pad("", 34)}${lpad("warm doc", 12)}${lpad("warm nav", 12)}${lpad("cold nav", 12)}`);
  out(`${pad("client total", 34)}${lpad(ms(warmDoc.clientMs), 12)}${lpad(ms(warmRsc.clientMs), 12)}${lpad(ms(cold.clientMs), 12)}`);
  out(`${pad("server total", 34)}${lpad(ms(warmDoc.serverMs), 12)}${lpad(ms(warmRsc.serverMs), 12)}${lpad(ms(cold.serverMs), 12)}`);
  for (const [key, label] of Object.entries(PART_LABELS)) {
    out(`${pad("  " + label, 34)}${lpad(ms(warmDoc.parts[key]), 12)}${lpad(ms(warmRsc.parts[key]), 12)}${lpad(ms(cold.parts[key]), 12)}`);
  }
  out(`${pad("localhost network + browser", 34)}${lpad(ms(warmDoc.localNetworkMs), 12)}${lpad(ms(warmRsc.localNetworkMs), 12)}${lpad(ms(cold.localNetworkMs), 12)}`);
  out(`${pad("response size", 34)}${lpad(`${(warmDoc.bytes / 1024).toFixed(0)}KB`, 12)}${lpad(`${(warmRsc.bytes / 1024).toFixed(0)}KB`, 12)}${lpad(`${(cold.bytes / 1024).toFixed(0)}KB`, 12)}`);
  out(`${pad("snapshot queries / tables read", 34)}${lpad(`${warmDoc.counts.queries}/${warmDoc.counts.tablesRead}`, 12)}${lpad(`${warmRsc.counts.queries}/${warmRsc.counts.tablesRead}`, 12)}${lpad(`${cold.counts.queries}/${cold.counts.tablesRead}`, 12)}`);
  out(`${pad("Supabase calls (cold)", 34)}${lpad("", 12)}${lpad("", 12)}${lpad(cold.counts.supabaseCalls, 12)}`);

  // CPU split of the unspanned "render + serialize + framework" bucket.
  const cpuRun = results.cpu.find((c) => c.route === route);
  const cpuFile = cpuRun ? path.join(DIR, `${cpuRun.name}.cpuprofile`) : null;
  if (cpuFile && fs.existsSync(cpuFile)) {
    const totals = cpuBreakdown(JSON.parse(fs.readFileSync(cpuFile, "utf8")));
    const perRequest = Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, v / cpuRun.requests]));
    const busy = sum(Object.entries(perRequest).filter(([k]) => k !== "idle").map(([, v]) => v));
    const wallPerRequest = cpuRun.wallMs / cpuRun.requests;
    report.routes[route].cpuPerRequest = perRequest;
    out(`  CPU per warm nav (${cpuRun.requests} requests profiled; ${ms(busy)} busy of ${ms(wallPerRequest)} client wall):`);
    for (const [k, v] of Object.entries(perRequest).filter(([cat]) => cat !== "idle").sort((a, b) => b[1] - a[1])) {
      if (v < 0.05) continue;
      out(`    ${pad(k, 52)}${lpad(ms(v), 9)}  ${lpad(pct(v, busy), 6)}`);
    }

    // Allocate the measured render bucket by CPU category, after removing
    // the CPU already covered by spans (snapshot queries) and the profiler.
    const bucket = warmRsc.parts.renderAndFramework;
    const covered = new Set(["snapshot queries", "profiler overhead", "idle"]);
    const inBucket = Object.entries(perRequest).filter(([k]) => !covered.has(k) && !k.includes("(under supabase-js)"));
    const bucketCpu = sum(inBucket.map(([, v]) => v));
    const waitMs = Math.max(0, bucket - bucketCpu);
    const group = (test) => sum(inBucket.filter(([k]) => test(k)).map(([, v]) => v));
    const split = {
      "components (app/)": group((k) => k.startsWith("components")),
      "data shaping (lib/)": group((k) => k.startsWith("data shaping")),
      "RSC + HTML serialization": group((k) => k.startsWith("RSC") || k.startsWith("HTML") || k.includes("(under RSC") || k.includes("(under HTML")),
      "React runtime": group((k) => k.startsWith("React") || k.includes("(under React")),
      "Next.js framework": group((k) => k.startsWith("Next.js") || k.includes("(under Next.js")),
      "GC + V8 native": group((k) => k === "garbage collection" || k === "V8 native" || k.includes("(under V8")),
      "other": group((k) => /^(other|Node I\/O|supabase-js)/.test(k) || k.includes("(under other") || k.includes("(under Node")),
      "event-loop / stream wait (no CPU)": waitMs,
    };
    report.routes[route].renderBucketSplit = split;
    out(`  "render + serialize + framework" ${ms(bucket)} split by CPU (allocated):`);
    for (const [k, v] of Object.entries(split)) out(`    ${pad(k, 52)}${lpad(ms(Math.min(v, bucket)), 9)}`);
  }
}

// ---------------------------------------------------------------------------
// Question 1: slowest single operation.
// ---------------------------------------------------------------------------

const allRequests = results.requests;
const OP_CATS = new Set(["table-fetch", "supabase", "query", "auth", "cache"]);
const allOps = allRequests.flatMap((r) => r.spans.filter((s) => OP_CATS.has(s.cat)).map((s) => ({ ...s, route: r.route, phase: r.phase })));
// A table fetch contains its HTTP calls and a cache read contains its fetch:
// rank the innermost meaningful unit, the whole-table fetch.
const slowest = [...allOps].filter((s) => s.cat !== "cache").sort((a, b) => b.ms - a.ms)[0];

out("");
out("━━ Q1. Slowest single operation ━━");
if (slowest) {
  out(`${slowest.cat} "${slowest.name}" — ${ms(slowest.ms)} (${slowest.phase}, during ${slowest.route})  ${JSON.stringify(slowest.meta)}`);
  if (slowest.cat === "table-fetch") {
    const req = allRequests.find((r) => r.spans.some((s) => s === undefined || (s.start === slowest.start && s.name === slowest.name)));
    const calls = (req?.spans ?? [])
      .filter((s) => s.cat === "supabase" && s.start >= slowest.start && s.start <= slowest.start + slowest.ms && s.name.includes(`/rest/v1/${slowest.name}`));
    const callMs = sum(calls.map((c) => c.ms));
    const up = sum(calls.map((c) => c.meta.upstreamMs ?? 0));
    const dl = sum(calls.map((c) => c.meta.downloadMs));
    const bytes = sum(calls.map((c) => c.meta.bytes));
    out(`  ${calls.length} sequential page requests, ${(bytes / 1024).toFixed(0)}KB total`);
    calls.forEach((c, i) => out(`    page ${i + 1}: ${ms(c.ms)} total = ${ms(c.meta.upstreamMs ?? 0)} Supabase processing + ${ms(c.meta.ttfbMs - (c.meta.upstreamMs ?? 0))} network to first byte + ${ms(c.meta.downloadMs)} download (${(c.meta.bytes / 1024).toFixed(0)}KB)`));
    out(`  Supabase processing ${ms(up)} (${pct(up, slowest.ms)}), network+download ${ms(callMs - up)} (${pct(callMs - up, slowest.ms)}) of which download ${ms(dl)}, parse/concat ${ms(slowest.ms - callMs)} (${pct(slowest.ms - callMs, slowest.ms)})`);
    if (calls.length > 1) {
      const longest = Math.max(...calls.map((c) => c.ms));
      out(`  Pages run one after another: ${ms(callMs)} serial vs ${ms(longest)} for the longest single page.`);
    }
  }
  // Every table fetch in cold runs, for the volume comparison.
  const fetchStats = {};
  for (const s of allOps.filter((o) => o.cat === "table-fetch")) {
    const st = (fetchStats[s.name] ??= { n: 0, ms: [], rows: s.meta.rows, pages: s.meta.pages });
    st.n += 1;
    st.ms.push(s.ms);
  }
  out("  Whole-table fetches (median per fetch, cold runs):");
  for (const [table, st] of Object.entries(fetchStats).sort((a, b) => median(b[1].ms) - median(a[1].ms))) {
    out(`    ${pad(table, 24)}${lpad(ms(median(st.ms)), 9)}  ${lpad(st.rows, 6)} rows  ${st.pages} page(s)  ${lpad((median(st.ms) / Math.max(1, st.rows)).toFixed(3), 7)}ms/row`);
  }
  report.slowest = slowest;
  report.tableFetches = fetchStats;
}

// ---------------------------------------------------------------------------
// Question 2: fast but frequent.
// ---------------------------------------------------------------------------

const warm = allRequests.filter((r) => r.phase === "warm");
const agg = new Map();
for (const r of warm) {
  for (const s of r.spans) {
    if (!OP_CATS.has(s.cat) && s.cat !== "proxy") continue;
    const key = s.cat === "query" ? `query ${s.meta.signature}` : `${s.cat} ${s.name}`;
    const a = agg.get(key) ?? { key, cat: s.cat, count: 0, totalMs: 0, max: 0 };
    a.count += 1;
    a.totalMs += s.ms;
    a.max = Math.max(a.max, s.ms);
    agg.set(key, a);
  }
}
// Group all snapshot queries on one table together too.
const byTable = new Map();
for (const r of warm) for (const s of r.spans.filter((x) => x.cat === "query")) {
  const a = byTable.get(s.name) ?? { key: `all snapshot queries on ${s.name}`, count: 0, totalMs: 0, scanned: 0 };
  a.count += 1;
  a.totalMs += s.ms;
  a.scanned += s.meta.scanned;
  byTable.set(s.name, a);
}

out("");
out(`━━ Q2. Fast individually, adds up (across ${warm.length} warm requests) ━━`);
const topAgg = [...agg.values()].sort((a, b) => b.totalMs - a.totalMs).slice(0, 12);
out(`${pad("operation", 70)}${lpad("count", 7)}${lpad("per req", 9)}${lpad("avg", 9)}${lpad("total", 11)}`);
for (const a of topAgg) {
  out(`${pad(a.key.slice(0, 68), 70)}${lpad(a.count, 7)}${lpad((a.count / warm.length).toFixed(1), 9)}${lpad(ms(a.totalMs / a.count), 9)}${lpad(ms(a.totalMs), 11)}`);
}
out("By table:");
for (const a of [...byTable.values()].sort((x, y) => y.totalMs - x.totalMs)) {
  out(`  ${pad(a.key, 44)}${lpad(a.count, 6)} runs  ${lpad((a.count / warm.length).toFixed(1), 5)}/req  ${lpad(ms(a.totalMs / a.count), 8)} avg  ${lpad(ms(a.totalMs / warm.length), 8)}/req  ${lpad(Math.round(a.scanned / a.count), 6)} rows scanned each`);
}
report.frequent = topAgg;
report.queriesByTable = [...byTable.values()];

// ---------------------------------------------------------------------------
// Question 3: work that produces nothing the client uses.
// ---------------------------------------------------------------------------

out("");
out("━━ Q3. Work producing nothing the client uses ━━");
// (a) Identical snapshot queries repeated within one request: every run
// after the first recomputes a result the request already had.
let duplicateMs = 0;
let serverMsTotal = 0;
const duplicateKinds = new Map();
for (const r of warm) {
  const bd = breakdown(r);
  serverMsTotal += bd.serverMs;
  const seen = new Set();
  for (const s of r.spans.filter((x) => x.cat === "query")) {
    if (seen.has(s.meta.signature)) {
      duplicateMs += s.ms;
      const d = duplicateKinds.get(s.meta.signature) ?? { count: 0, ms: 0 };
      d.count += 1;
      d.ms += s.ms;
      duplicateKinds.set(s.meta.signature, d);
    } else seen.add(s.meta.signature);
  }
}
out(`(a) Repeated identical snapshot queries within a request: ${ms(duplicateMs / warm.length)}/request = ${pct(duplicateMs, serverMsTotal)} of warm server time`);
for (const [sig, d] of [...duplicateKinds.entries()].sort((a, b) => b[1].ms - a[1].ms).slice(0, 6)) {
  out(`      ${sig.slice(0, 90)} — repeated ${(d.count / warm.length).toFixed(1)}×/req, ${ms(d.ms / warm.length)}/req`);
}
report.waste = { duplicateQueryMsPerRequest: duplicateMs / warm.length, warmServerMsPerRequest: serverMsTotal / warm.length };

// (b) Browse capture: prefetch renders for pages never opened, and server
// actions that wrote nothing.
const browse = readJson("browse.json");
if (browse) {
  const requests = browse.spans.filter((s) => s.cat === "request" && !s.name.includes("/_next/") && !s.name.includes("/api/profile"));
  const totalMs = sum(requests.map((s) => s.ms));
  const visited = new Set(browse.visited);
  const prefetches = requests.filter((s) => s.meta.prefetch);
  const unusedPrefetch = prefetches.filter((s) => !visited.has(pathOf(s.name)));
  const actions = requests.filter((s) => s.meta.action);
  const writes = browse.spans.filter((s) => s.cat === "supabase" && !/^GET /.test(s.name) && !s.name.includes("/auth/"));
  const noopActions = actions.filter((a) => !writes.some((w) => w.start >= a.start && w.start <= a.start + a.ms));
  const rows = [
    ["all server requests", requests.length, totalMs],
    ["  documents + navigations", requests.filter((s) => !s.meta.prefetch && !s.meta.action).length, sum(requests.filter((s) => !s.meta.prefetch && !s.meta.action).map((s) => s.ms))],
    ["  prefetch renders", prefetches.length, sum(prefetches.map((s) => s.ms))],
    ["    …for pages never opened", unusedPrefetch.length, sum(unusedPrefetch.map((s) => s.ms))],
    ["  server actions", actions.length, sum(actions.map((s) => s.ms))],
    ["    …that wrote nothing", noopActions.length, sum(noopActions.map((s) => s.ms))],
  ];
  out(`(b) Browse capture ${browse.startedAt} → ${browse.savedAt}, pages opened: ${[...visited].join(", ") || "(none listed)"}`);
  for (const [label, n, t] of rows) out(`      ${pad(label, 34)}${lpad(n, 5)} requests  ${lpad(ms(t), 10)}  ${lpad(pct(t, totalMs), 6)}`);
  const perPath = new Map();
  for (const s of prefetches) {
    const p = pathOf(s.name);
    const a = perPath.get(p) ?? { n: 0, ms: 0 };
    a.n += 1;
    a.ms += s.ms;
    perPath.set(p, a);
  }
  out(`      prefetches by page: ${[...perPath.entries()].map(([p, a]) => `${p} ×${a.n} (${ms(a.ms)})`).join(", ")}`);
  const wasted = sum(unusedPrefetch.map((s) => s.ms)) + sum(noopActions.map((s) => s.ms));
  out(`      Unused prefetches + no-op actions: ${ms(wasted)} of ${ms(totalMs)} = ${pct(wasted, totalMs)} of all server time in the session`);
  report.waste.browse = { totalMs, wastedMs: wasted, unusedPrefetchMs: sum(unusedPrefetch.map((s) => s.ms)), noopActionMs: sum(noopActions.map((s) => s.ms)), requests: requests.length };
} else {
  out("(b) No .profile/browse.json — use \"Start browse capture\" on the driver page to measure prefetch and server-action waste.");
}

if (asJson) console.log(JSON.stringify(report, null, 2));
else console.log(lines.join("\n"));
