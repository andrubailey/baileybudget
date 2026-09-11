import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

// ============================================================================
// Cross-request data cache — the reason page transitions are now ~instant.
// ----------------------------------------------------------------------------
// Every page used to fire 5–15 live Supabase queries per request, each a
// ~100ms round trip to the hosted database, and most of them sequential.
// That's where the 300–1100ms "application-code" time in the dev log went.
//
// The household's data is small (a few thousand transactions, a few dozen
// of everything else) and shared between the two people who use the app,
// so instead of asking Postgres the same questions on every navigation,
// each table is pulled once into Next's Data Cache and every read in
// lib/queries.ts is answered from that snapshot in memory, in microseconds.
// A write (any server action, the Shortcuts API, the assistant) invalidates
// the affected table's tag, so the next read re-fetches. On Vercel the Data
// Cache is shared across instances, so one spouse's write invalidates for
// the other.
//
// The snapshot is fetched with the service-role client. That's deliberate:
// unstable_cache callbacks can't read cookies, and the household's RLS
// policy is "any signed-in user sees everything" anyway — so the cached
// data is identical to what any signed-in user would get. The auth
// boundary stays where it was: the proxy middleware and the (app) layout
// refuse to render anything for a request without a valid session, and
// server actions can't be reached without one either. Nothing here is
// exposed to an unauthenticated request.
//
// `snapshotClient()` below mimics the small subset of the PostgREST query
// builder that lib/queries.ts actually uses, so those functions read
// exactly as they did before — just against local arrays.
// ============================================================================

export const SNAPSHOT_TABLES = [
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
] as const;
export type SnapshotTable = (typeof SNAPSHOT_TABLES)[number];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

const PAGE_SIZE = 1000;

async function fetchWholeTable(table: SnapshotTable): Promise<Row[]> {
  const supabase = createAdminClient();
  const rows: Row[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      // Stable page order for the range walk — every table has an id;
      // not every one has created_at (profiles doesn't).
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      // A table whose migration hasn't been run yet (profiles, history)
      // shouldn't take every page down — it just reads as empty.
      if (/does not exist|relation/i.test(error.message)) return [];
      throw error;
    }
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

// One Data Cache entry per table, each tagged with its own name (so a
// budget edit doesn't throw away the transactions snapshot) plus the
// umbrella "household" tag. `revalidate: false` — entries live until a
// write invalidates them; there's no time-based staleness to wait out.
const cachedTable: Record<SnapshotTable, () => Promise<Row[]>> = Object.fromEntries(
  SNAPSHOT_TABLES.map((table) => [
    table,
    unstable_cache(() => fetchWholeTable(table), [`snapshot-${table}`], {
      tags: [table, "household"],
      revalidate: false,
    }),
  ]),
) as Record<SnapshotTable, () => Promise<Row[]>>;

// Per-request dedupe on top of the cross-request cache: a render that
// reads "transactions" from six different query functions parses the
// cached entry once.
export const getTable = cache(async (table: SnapshotTable): Promise<Row[]> => {
  try {
    return await cachedTable[table]();
  } catch (error) {
    // Outside a Next request (a one-off script, a test) there's no Data
    // Cache to store into — just read the table directly.
    if (error instanceof Error && /incrementalCache missing/.test(error.message)) {
      return fetchWholeTable(table);
    }
    throw error;
  }
});

// ---------------------------------------------------------------------------
// Minimal in-memory PostgREST — just the chain lib/queries.ts uses.
// ---------------------------------------------------------------------------

type Filter = (row: Row) => boolean;
type Order = { column: string; ascending: boolean; nullsFirst: boolean };

function likeToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a) < String(b) ? -1 : 1;
}

// Results are typed `any` on purpose — the real Supabase client's results
// are generic over a schema this app doesn't declare, and the query
// functions already narrow/cast what they read.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rows = any[];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OneRow = any;
type ListResult = { data: Rows; error: null; count: number | null };

class SnapshotQuery implements PromiseLike<ListResult> {
  private filters: Filter[] = [];
  private orders: Order[] = [];
  private limitCount: number | null = null;
  private rangeFrom = 0;
  private rangeTo: number | null = null;
  private countMode = false;

  constructor(private readonly load: () => Promise<Row[]>) {}

  // Column projection is ignored — callers get the full row, a superset of
  // what they asked for. `{ count: "exact", head: true }` returns a count.
  select(_columns?: string, options?: { count?: string; head?: boolean }) {
    if (options?.head) this.countMode = true;
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push((r) => r[column] === value);
    return this;
  }
  neq(column: string, value: unknown) {
    this.filters.push((r) => r[column] !== value);
    return this;
  }
  gt(column: string, value: unknown) {
    this.filters.push((r) => r[column] != null && compare(r[column], value) > 0);
    return this;
  }
  gte(column: string, value: unknown) {
    this.filters.push((r) => r[column] != null && compare(r[column], value) >= 0);
    return this;
  }
  lt(column: string, value: unknown) {
    this.filters.push((r) => r[column] != null && compare(r[column], value) < 0);
    return this;
  }
  lte(column: string, value: unknown) {
    this.filters.push((r) => r[column] != null && compare(r[column], value) <= 0);
    return this;
  }
  in(column: string, values: readonly unknown[]) {
    const set = new Set(values);
    this.filters.push((r) => set.has(r[column]));
    return this;
  }
  is(column: string, value: null | boolean) {
    this.filters.push((r) => (value === null ? r[column] == null : r[column] === value));
    return this;
  }
  not(column: string, operator: string, value: unknown) {
    if (operator === "is") {
      this.filters.push((r) => (value === null ? r[column] != null : r[column] !== value));
    } else if (operator === "eq") {
      this.filters.push((r) => r[column] !== value);
    } else {
      throw new Error(`snapshotClient: unsupported not(${operator})`);
    }
    return this;
  }
  ilike(column: string, pattern: string) {
    const re = likeToRegex(pattern);
    this.filters.push((r) => typeof r[column] === "string" && re.test(r[column]));
    return this;
  }
  like(column: string, pattern: string) {
    const re = new RegExp(likeToRegex(pattern).source);
    this.filters.push((r) => typeof r[column] === "string" && re.test(r[column]));
    return this;
  }
  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) {
    this.orders.push({
      column,
      ascending: options?.ascending ?? true,
      nullsFirst: options?.nullsFirst ?? !(options?.ascending ?? true),
    });
    return this;
  }
  limit(count: number) {
    this.limitCount = count;
    return this;
  }
  range(from: number, to: number) {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }

  private async run(): Promise<Row[]> {
    let rows = await this.load();
    if (this.filters.length > 0) rows = rows.filter((r) => this.filters.every((f) => f(r)));
    if (this.orders.length > 0) {
      rows = rows.slice().sort((a, b) => {
        for (const o of this.orders) {
          const av = a[o.column];
          const bv = b[o.column];
          if (av == null && bv == null) continue;
          if (av == null) return o.nullsFirst ? -1 : 1;
          if (bv == null) return o.nullsFirst ? 1 : -1;
          const c = compare(av, bv);
          if (c !== 0) return o.ascending ? c : -c;
        }
        // Deterministic tie-break so equal keys (a bulk import sharing one
        // created_at) don't reshuffle between renders.
        return compare(a.id, b.id);
      });
    }
    if (this.rangeTo !== null) rows = rows.slice(this.rangeFrom, this.rangeTo + 1);
    if (this.limitCount !== null) rows = rows.slice(0, this.limitCount);
    return rows;
  }

  async single(): Promise<{ data: OneRow; error: null }> {
    const rows = await this.run();
    return { data: rows[0] ?? null, error: null };
  }
  async maybeSingle(): Promise<{ data: OneRow; error: null }> {
    return this.single();
  }

  then<R1 = ListResult, R2 = never>(
    onfulfilled?: ((value: ListResult) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return this.run()
      .then(
        (rows): ListResult =>
          this.countMode
            ? { data: [], error: null, count: rows.length }
            : { data: rows, error: null, count: null },
      )
      .then(onfulfilled ?? undefined, onrejected ?? undefined);
  }
}

// Shaped like the Supabase client for the read paths in lib/queries.ts.
// Typed loosely on purpose: the real client is generic over the schema,
// and these query functions already cast their results.
export function snapshotClient() {
  return {
    from(table: string): SnapshotQuery {
      if (!(SNAPSHOT_TABLES as readonly string[]).includes(table)) {
        throw new Error(`snapshotClient: "${table}" is not a cached table`);
      }
      return new SnapshotQuery(() => getTable(table as SnapshotTable));
    },
  };
}
