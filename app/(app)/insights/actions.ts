"use server";

import { revalidateHousehold } from "@/lib/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentSession } from "@/lib/profile";
import { normalizeInsightsPrefs, type InsightsPrefs } from "@/lib/insights-prefs";

// Saves the Insights page setup (range, card order, hidden cards) onto the
// signed-in person's own profile row — profiles RLS only lets you write
// your own. Needs migration 030 (profiles.insights_prefs).
export async function saveInsightsPrefs(prefs: InsightsPrefs): Promise<{ ok: boolean; error?: string }> {
  const user = (await getCurrentSession())?.user ?? null;
  if (!user) return { ok: false, error: "Not signed in." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .upsert({ id: user.id, insights_prefs: normalizeInsightsPrefs(prefs), updated_at: new Date().toISOString() });
  if (error) {
    const missingColumn = /insights_prefs/.test(error.message);
    return {
      ok: false,
      error: missingColumn
        ? "Run supabase/030_profile_insights_prefs.sql to save your Insights layout."
        : error.message,
    };
  }

  revalidateHousehold(["profiles"]);
  return { ok: true };
}
