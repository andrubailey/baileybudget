import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// React's cache() dedupes by arguments within a single request's render —
// the layout and the dashboard page both need the session and the
// household's display name, and without this each would trigger its own
// redundant round-trip for data the other already fetched moments earlier
// in the same request.
export const getCurrentSession = cache(async () => {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
});

export const getCurrentUserProfile = cache(async (userId: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("display_name, avatar_url")
    .eq("id", userId)
    .maybeSingle();
  // Best-effort: a household that hasn't run the profiles table migration
  // yet should just fall back to the email-derived name, not crash.
  if (error) console.error("profile query failed:", error);
  return data;
});
