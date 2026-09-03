import { createClient } from "@/lib/supabase/server";
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

// Periods aren't created manually — the current month's period is created
// automatically the first time anyone loads the app in a new month.
export async function getPeriods(): Promise<Period[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("periods")
    .select("*")
    .order("start_date", { ascending: false });
  const periods = data ?? [];

  const today = new Date().toISOString().slice(0, 10);
  const hasCurrent = periods.some(
    (p) => p.start_date <= today && p.end_date >= today,
  );
  if (!hasCurrent) {
    const { data: created } = await supabase
      .from("periods")
      .insert(currentMonthRange())
      .select("*")
      .single();
    if (created) {
      periods.unshift(created);
      periods.sort((a, b) => (a.start_date < b.start_date ? 1 : -1));
    }
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
  const current = periods.find(
    (p) => p.start_date <= today && p.end_date >= today,
  );
  return current ?? periods[0];
}
