import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { PROFILING, profiledFetch } from "@/lib/perf";

// Service-role client: bypasses RLS entirely. Only import this from
// server-only code that itself enforces access control (e.g. the Shortcuts
// API route, which checks a hashed personal access token before ever
// touching this client) — never expose it to a Server Component that trusts
// the caller's Supabase session, since it ignores that session completely.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  }
  return createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    ...(PROFILING ? { global: { fetch: profiledFetch } } : {}),
  });
}
