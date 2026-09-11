import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { snapshotClient } from "@/lib/snapshot";

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

// Served from the cached snapshot (see lib/snapshot.ts) — a missing
// profiles table just reads as no profile, falling back to the email name.
export const getCurrentUserProfile = cache(async (userId: string) => {
  const { data } = await snapshotClient()
    .from("profiles")
    .select("display_name, avatar_url")
    .eq("id", userId)
    .maybeSingle();
  return data as { display_name: string | null; avatar_url: string | null } | null;
});
