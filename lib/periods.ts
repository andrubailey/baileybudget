import { createClient } from "@/lib/supabase/server";
import type { Period } from "@/lib/types";

export async function getPeriods(): Promise<Period[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("periods")
    .select("*")
    .order("start_date", { ascending: false });
  return data ?? [];
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
