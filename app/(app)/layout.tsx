import { Sidebar } from "./sidebar";
import { MobileNav } from "./mobile-nav";
import { MobileTabBar } from "./mobile-tab-bar";
import { ToastProvider } from "./toast";
import { GlobalShortcuts } from "./global-shortcuts";
import { ShortcutsModal } from "./shortcuts-modal";
import { PullToRefresh } from "./pull-to-refresh";
import { PageTransition } from "./page-transition";
import { FinancesChat } from "./finances-chat";
import { DataQualityBanner, type DataQualityIssue } from "./data-quality-banner";
import { getTable } from "@/lib/snapshot";
import { getCurrentSession, getCurrentUserProfile } from "@/lib/profile";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // getCurrentSession() reads the JWT straight from cookies with no network
  // call — the real validation already happened in proxy.ts's middleware.
  // The nav badge count and the data-quality banner below both come from the
  // cached transactions snapshot, so this layout costs no database round
  // trip at all.
  const [session, transactions, splits] = await Promise.all([
    getCurrentSession(),
    getTable("transactions"),
    getTable("transaction_splits"),
  ]);
  const activeTransactions = transactions.filter((t) => t.deleted_at == null);
  const pendingApprovalCount = activeTransactions.filter((t) => t.pending_approval === true).length;
  // A split parent stores category_id: null too, but its real breakdown
  // lives in transaction_splits — it isn't actually uncategorized, so it's
  // excluded here the same way the Transactions page's own "Uncategorized"
  // filter excludes it.
  const splitParentIds = new Set(splits.map((s) => s.transaction_id));
  const uncategorizedCount = activeTransactions.filter(
    (t) => t.kind !== "transfer" && t.category_id === null && !splitParentIds.has(t.id),
  ).length;
  const user = session?.user ?? null;
  const profile = user ? await getCurrentUserProfile(user.id) : null;

  const navCounts = { "/spending": pendingApprovalCount };
  const dataQualityIssues: DataQualityIssue[] = [
    {
      key: "uncategorized",
      count: uncategorizedCount,
      label: uncategorizedCount === 1 ? "transaction needs a category" : "transactions need a category",
      href: "/transactions?flag=uncategorized",
    },
    {
      key: "pending",
      count: pendingApprovalCount,
      label: pendingApprovalCount === 1 ? "transaction waiting for approval" : "transactions waiting for approval",
      href: "/transactions?flag=pending",
    },
  ];

  return (
    <ToastProvider>
      <GlobalShortcuts />
      <ShortcutsModal />
      <div className="flex min-h-full flex-1 flex-col lg:flex-row">
        <MobileNav />
        <Sidebar
          counts={navCounts}
          userEmail={user?.email ?? null}
          displayName={profile?.display_name ?? null}
          avatarUrl={profile?.avatar_url ?? null}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <DataQualityBanner issues={dataQualityIssues} />
          <main className="w-full min-w-0 flex-1 px-4 pt-10 pb-28 sm:px-6 lg:px-8 lg:pt-16 lg:pb-32">
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
