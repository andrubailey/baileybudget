import { createAdminClient } from "@/lib/supabase/admin";
import { snapshotClient } from "@/lib/snapshot";
import type { Period } from "@/lib/types";

function currentMonthRange() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
  const end = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return {
    name: start.toLocaleString("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }),
    start_date: iso(start),
    end_date: iso(end),
  };
}

function coversToday(p: { start_date: string; end_date: string }, today: string) {
  return p.start_date <= today && p.end_date >= today;
}

// Periods aren't created manually — the current month's period is created
// automatically the first time anyone loads the app in a new month. Reads
// come from the cached snapshot; the once-a-month insert goes straight to
// the database and is merged into this call's result, since a render can't
// invalidate the cache itself. Until the next write invalidates it, the
// snapshot may still lack the new month — so the existence check below
// always re-asks the database before inserting, never the snapshot, which
// is what keeps this from creating a duplicate on every request in that
// window.
export async function getPeriods(): Promise<Period[]> {
  const { data } = await snapshotClient()
    .from("periods")
    .select("*")
    .order("start_date", { ascending: false });
  const periods: Period[] = data ?? [];

  const today = new Date().toISOString().slice(0, 10);
  if (periods.some((p) => coversToday(p, today))) return periods;

  const admin = createAdminClient();
  const { data: live } = await admin
    .from("periods")
    .select("*")
    .lte("start_date", today)
    .gte("end_date", today)
    .limit(1);
  let current: Period | null = live?.[0] ?? null;
  if (!current) {
    const { data: created } = await admin
      .from("periods")
      .insert(currentMonthRange())
      .select("*")
      .single();
    current = created ?? null;
  }
  if (current && !periods.some((p) => p.id === current!.id)) {
    periods.unshift(current);
    periods.sort((a, b) => (a.start_date < b.start_date ? 1 : -1));
  }
  return periods;
}

export function pickPeriod(
  periods: Period[],
  requestedId?: string,
): Period | null {
  if (!periods.length) return null;

  if (requestedId) {
    const found = periods.find((p) => p.id === requestedId);
    if (found) return found;
  }

  const today = new Date().toISOString().slice(0, 10);
  const current = periods.find((p) => coversToday(p, today));
  return current ?? periods[0];
}
