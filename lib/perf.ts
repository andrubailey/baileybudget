// Request profiling, off unless the server is started with PROFILE=1.
//
// Code under measurement calls record()/timed(); with the flag off both are
// a single boolean check. Spans collect in a process-wide buffer (on
// globalThis, so the proxy, route handlers, and page renders all share one)
// that the /api/profile route drains. See scripts/profile-report.mjs.

export const PROFILING = process.env.PROFILE === "1";

export type PerfCategory =
  // A whole HTTP request, arrival to last byte (lib/perf-server.ts).
  | "request"
  // The auth proxy: the whole proxy pass, and the getClaims() inside it.
  | "proxy"
  | "auth"
  // One HTTP call to Supabase. meta.upstreamMs is Supabase's own reported
  // processing time (PostgREST + Postgres); the rest is network.
  | "supabase"
  // A whole-table snapshot fetch (all pages) inside the Data Cache miss path.
  | "table-fetch"
  // getTable(): reading one table from the Data Cache, including a fetch on
  // a miss. Minus any nested table-fetch, this is cache read + deserialize.
  | "cache"
  // One in-memory snapshot query: filter/sort/slice over cached rows.
  | "query";

export type PerfSpan = {
  cat: PerfCategory;
  name: string;
  start: number;
  ms: number;
  meta?: Record<string, unknown>;
};

type Store = { spans: PerfSpan[]; tableFetches: Record<string, number> };
const store: Store = ((globalThis as { __bbPerf?: Store }).__bbPerf ??= {
  spans: [],
  tableFetches: {},
});

// Epoch milliseconds with sub-millisecond precision.
export const clock = () => performance.timeOrigin + performance.now();

export function record(cat: PerfCategory, name: string, start: number, meta?: Record<string, unknown>) {
  if (!PROFILING) return;
  store.spans.push({ cat, name, start, ms: clock() - start, meta });
}

export async function timed<T>(
  cat: PerfCategory,
  name: string,
  fn: () => Promise<T>,
  meta?: Record<string, unknown>,
): Promise<T> {
  if (!PROFILING) return fn();
  const start = clock();
  try {
    return await fn();
  } finally {
    record(cat, name, start, meta);
  }
}

export function drainSpans(): PerfSpan[] {
  const spans = store.spans;
  store.spans = [];
  return spans;
}

// How many times each table has been fetched from Supabase, so getTable()
// can tell a Data Cache hit from a miss.
export function countTableFetch(table: string) {
  store.tableFetches[table] = (store.tableFetches[table] ?? 0) + 1;
}
export function tableFetchCount(table: string) {
  return store.tableFetches[table] ?? 0;
}

// A fetch that times each Supabase call: time to headers, body download,
// bytes, and Supabase's own upstream processing time when it reports one.
// The body is buffered and handed back unchanged.
export const profiledFetch: typeof fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const method = init?.method ?? (input instanceof Request ? input.method : "GET");
  const start = clock();
  const res = await fetch(input, init);
  const headersAt = clock();
  const body = await res.arrayBuffer();
  const upstreamHeader = res.headers.get("x-envoy-upstream-service-time");
  record("supabase", `${method} ${new URL(url).pathname}`, start, {
    ttfbMs: headersAt - start,
    downloadMs: clock() - headersAt,
    upstreamMs: upstreamHeader === null ? null : Number(upstreamHeader),
    bytes: body.byteLength,
    status: res.status,
  });
  return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
};
