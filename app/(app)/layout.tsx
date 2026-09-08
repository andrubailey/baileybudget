import { Sidebar } from "./sidebar";
import { MobileNav } from "./mobile-nav";
import { MobileTabBar } from "./mobile-tab-bar";
import { ToastProvider } from "./toast";
import { CommandPalette } from "./command-palette";
import { PullToRefresh } from "./pull-to-refresh";
import { PageTransition } from "./page-transition";
import { FinancesChat } from "./finances-chat";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  // getSession() reads the JWT straight from cookies with no network call,
  // unlike getUser() which re-validates against the auth server every time.
  // That revalidation already happened once in proxy.ts's middleware for
  // every request that reaches this layout — redoing it here just to read
  // an email for display was a second full auth round-trip on every single
  // page load. Run it alongside the count query instead of blocking first.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;

  const [
    { count: pendingApprovalCount, error: pendingApprovalError },
    { data: profile, error: profileError },
  ] = await Promise.all([
    // Best-effort: a nav badge count should never take down every page in
    // the app if the query fails (e.g. a migration not yet run in this
    // database).
    supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("pending_approval", true)
      .is("deleted_at", null),
    // Same best-effort treatment — the profiles table migration is manual,
    // so a household that hasn't run it yet should just see the
    // email-derived fallback instead of a crashed sidebar.
    user
      ? supabase
          .from("profiles")
          .select("display_name, avatar_url")
          .eq("id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (pendingApprovalError) {
    console.error("pending_approval count query failed:", pendingApprovalError);
  }
  if (profileError) {
    console.error("profile query failed:", profileError);
  }

  const navCounts = { "/transactions": pendingApprovalError ? 0 : (pendingApprovalCount ?? 0) };

  return (
    <ToastProvider>
      <CommandPalette />
      <div className="flex min-h-full flex-1 flex-col lg:flex-row">
        <MobileNav counts={navCounts} />
        <Sidebar
          counts={navCounts}
          userEmail={user?.email ?? null}
          displayName={profile?.display_name ?? null}
          avatarUrl={profile?.avatar_url ?? null}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <main className="w-full min-w-0 flex-1 px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:py-10 lg:pb-10">
            <PullToRefresh>
              <div className="mx-auto max-w-[1600px]">
                <PageTransition>{children}</PageTransition>
              </div>
            </PullToRefresh>
          </main>
        </div>
        <FinancesChat />
        <MobileTabBar counts={navCounts} />
      </div>
    </ToastProvider>
  );
}
