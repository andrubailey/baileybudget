import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { snapshotClient } from "@/lib/snapshot";
import type { Period } from "@/lib/types";

function monthRange(isoDate: string) {
  const [year, month] = isoDate.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
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

// Returns the period for the month containing `isoDate`, creating it if it
// doesn't exist yet. Safe under concurrent calls: the unique index on
// start_date (migration 036) turns the insert into "create if missing", and
// the follow-up read returns whichever row won. Before 036 is applied there's
// no index to conflict on, so it falls back to a plain insert.
export async function ensureMonthPeriod(
  isoDate: string,
  admin: ReturnType<typeof createAdminClient> = createAdminClient(),
): Promise<Period | null> {
  const range = monthRange(isoDate);
  const { error } = await admin
    .from("periods")
    .upsert(range, { onConflict: "start_date", ignoreDuplicates: true });
  if (error) await admin.from("periods").insert(range);
  const { data } = await admin
    .from("periods")
    .select("*")
    .eq("start_date", range.start_date)
    .order("created_at")
    .limit(1);
  return data?.[0] ?? null;
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
// cache(): the layout and the page both call this in one render; without it
// each would check and create the new month on its own.
export const getPeriods = cache(async (): Promise<Period[]> => {
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
  const current: Period | null = live?.[0] ?? (await ensureMonthPeriod(today, admin));
  if (current && !periods.some((p) => p.id === current!.id)) {
    periods.unshift(current);
    periods.sort((a, b) => (a.start_date < b.start_date ? 1 : -1));
  }
  return periods;
});

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
