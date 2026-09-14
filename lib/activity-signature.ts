import type { Row } from "@/lib/snapshot";

// A cheap fingerprint of the transactions table: total row count (a new
// transaction), non-deleted count (a delete, which leaves the total alone),
// and the newest updated_at/created_at (an edit to an existing row). Shared
// by the layout (computing the baseline a page loads with, for free, off
// the same snapshot it already fetched) and freshness-actions.ts (computing
// the same thing fresh on each poll) — kept in one place so the two never
// drift into disagreeing about what counts as "changed."
export function activitySignature(rows: Row[]): string {
  const active = rows.filter((r) => r.deleted_at == null).length;
  const latest = rows.reduce((max, r) => {
    const raw = (r.updated_at ?? r.created_at) as string | undefined;
    const t = raw ? new Date(raw).getTime() : NaN;
    return Number.isFinite(t) ? Math.max(max, t) : max;
  }, 0);
  return `${rows.length}:${active}:${latest}`;
}
