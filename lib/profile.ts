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

// Every household member's display name, for headers that address both of
// us rather than whoever happens to be signed in. RLS already lets any
// authenticated user read all profiles.
export const getHouseholdNames = cache(async (): Promise<string[]> => {
  const { data } = await snapshotClient()
    .from("profiles")
    .select("display_name")
    .order("display_name", { ascending: true });
  return (data ?? [])
    .map((p) => (p.display_name as string | null)?.trim())
    .filter((n): n is string => Boolean(n));
});

export type HouseholdMember = {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  email: string | null;
};

// Both of us, for the add sheet's "who logged it" avatar. `profiles` has no
// email column, so the address is recovered from the created_by/
// created_by_email pairs transactions already carry — which also means a
// member who has never logged anything still appears (from profiles) just
// without an email to stamp.
export const getHouseholdMembers = cache(async (): Promise<HouseholdMember[]> => {
  const client = snapshotClient();
  const [{ data: profiles }, { data: authored }] = await Promise.all([
    client
      .from("profiles")
      .select("id, display_name, avatar_url")
      .order("display_name", { ascending: true }),
    client.from("transactions").select("created_by, created_by_email"),
  ]);

  const emailById = new Map<string, string>();
  for (const row of authored ?? []) {
    const id = row.created_by as string | null;
    const email = row.created_by_email as string | null;
    if (id && email && !emailById.has(id)) emailById.set(id, email);
  }

  const members: HouseholdMember[] = (profiles ?? []).map((p) => ({
    id: p.id as string,
    displayName: (p.display_name as string | null) ?? null,
    avatarUrl: (p.avatar_url as string | null) ?? null,
    email: emailById.get(p.id as string) ?? null,
  }));

  // Someone who has logged transactions but has no profile row yet would
  // otherwise be missing from the switcher entirely.
  const known = new Set(members.map((m) => m.id));
  for (const [id, email] of emailById) {
    if (!known.has(id)) {
      members.push({ id, displayName: null, avatarUrl: null, email });
    }
  }
  return members;
});
