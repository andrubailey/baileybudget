import { PageHeader } from "@/app/(app)/page-header";
import { computeInsights } from "@/lib/insights";
import { isRangeKey, normalizeInsightsPrefs, resolveInsightsRange } from "@/lib/insights-prefs";
import { getCurrentSession } from "@/lib/profile";
import { snapshotClient } from "@/lib/snapshot";
import { InsightsView } from "./insights-view";

// Insights: one observation per card about the household's money for the
// selected time range. The range comes from the URL when you've just picked
// one, otherwise from what you last saved on your profile — so it persists
// between visits and across devices.
export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; start?: string; end?: string }>;
}) {
  const params = await searchParams;
  const session = await getCurrentSession();
  const userId = session?.user?.id ?? null;
  const { data: profile } = userId
    ? await snapshotClient().from("profiles").select("*").eq("id", userId).maybeSingle()
    : { data: null };
  const saved = normalizeInsightsPrefs(profile?.insights_prefs);
  // A profile row without the column means migration 030 hasn't run yet.
  const canSave = !profile || "insights_prefs" in profile;

  const fromUrl = isRangeKey(params.range);
  const todayIso = new Date().toISOString().slice(0, 10);
  const range = resolveInsightsRange(
    fromUrl ? params.range : saved.range,
    fromUrl ? params.start : saved.start,
    fromUrl ? params.end : saved.end,
    todayIso,
  );
  const data = await computeInsights(range, todayIso);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Insights"
        description="One observation per card about your money for the range you pick. Every figure links to the transactions behind it."
      />
      <InsightsView
        data={data}
        initialPrefs={{
          ...saved,
          range: range.key,
          start: range.key === "custom" ? range.start : undefined,
          end: range.key === "custom" ? range.end : undefined,
        }}
        canSave={canSave}
      />
    </div>
  );
}
