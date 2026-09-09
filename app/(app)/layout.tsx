import { Sidebar } from "./sidebar";
import { MobileNav } from "./mobile-nav";
import { MobileTabBar } from "./mobile-tab-bar";
import { ToastProvider } from "./toast";
import { GlobalShortcuts } from "./global-shortcuts";
import { PullToRefresh } from "./pull-to-refresh";
import { PageTransition } from "./page-transition";
import { FinancesChat } from "./finances-chat";
import { createClient } from "@/lib/supabase/server";
import { getCurrentSession, getCurrentUserProfile } from "@/lib/profile";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  // getCurrentSession() reads the JWT straight from cookies with no network
  // call, unlike getUser() which re-validates against the auth server every
  // time — that revalidation already happened once in proxy.ts's middleware
  // for every request that reaches this layout. It's also cache()-wrapped,
  // so the dashboard page below (which needs the same session for its own
  // greeting) reuses this exact call instead of re-fetching it.
  const [session, { count: pendingApprovalCount, error: pendingApprovalError }] =
    await Promise.all([
      getCurrentSession(),
      // Best-effort: a nav badge count should never take down every page in
      // the app if the query fails (e.g. a migration not yet run in this
      // database).
      supabase
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .eq("pending_approval", true)
        .is("deleted_at", null),
    ]);
  const user = session?.user ?? null;
  // Same cache()-wrapped dedup as the session above — the dashboard page
  // asks for this same household's profile row moments later in the same
  // request.
  const profile = user ? await getCurrentUserProfile(user.id) : null;
  if (pendingApprovalError) {
    console.error("pending_approval count query failed:", pendingApprovalError);
  }

  const navCounts = { "/transactions": pendingApprovalError ? 0 : (pendingApprovalCount ?? 0) };

  return (
    <ToastProvider>
      <GlobalShortcuts />
      <div className="flex min-h-full flex-1 flex-col lg:flex-row">
        <MobileNav />
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
        <MobileTabBar />
      </div>
    </ToastProvider>
  );
}
