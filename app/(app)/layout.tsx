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
import { OfflineQueueBanner } from "./offline-queue-banner";
import { FreshnessWatcher } from "./freshness-watcher";
import { getWeeklyRecapData } from "./weekly-recap";
import { getTable } from "@/lib/snapshot";
import { activitySignature } from "@/lib/activity-signature";
import { getCurrentSession, getCurrentUserProfile } from "@/lib/profile";
import { getAccounts, getBillsDueSoonCount, getCategories, getLowBalanceAccountCount } from "@/lib/queries";
import { getPeriods, pickPeriod } from "@/lib/periods";
import { headers } from "next/headers";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // getCurrentSession() reads the JWT straight from cookies with no network
  // call — the real validation already happened in proxy.ts's middleware.
  // The nav badge count and the data-quality banner below both come from the
  // cached transactions snapshot, so this layout costs no database round
  // trip at all. The recap lives in the same banner now (see
  // DataQualityBanner/WeeklyRecapAlert) so it's fetched here too — it needs
  // to be visible app-wide, not just on the Overview page.
  // periods/accounts/categories feed the mobile tab bar's Add sheet, which
  // opens in place as a modal — all read from the same cached snapshot.
  const [session, transactions, splits, recap, billsDueSoon, lowBalanceCount, periods, accounts, categories] =
    await Promise.all([
      getCurrentSession(),
      getTable("transactions"),
      getTable("transaction_splits"),
      getWeeklyRecapData(),
      getBillsDueSoonCount(),
      getLowBalanceAccountCount(),
      getPeriods(),
      getAccounts(),
      getCategories(),
    ]);
  const addPeriod = pickPeriod(periods);
  // Phones skip the page View Transition (see PageTransition). Same
  // phone-class user-agent check the auth proxy uses; tablets count as desktop.
  const isPhone = /Mobi|Android|iPhone|iPod/i.test((await headers()).get("user-agent") ?? "");
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

  // A cheap fingerprint of the same `transactions` snapshot already fetched
  // above — free to compute here, and it's what FreshnessWatcher polls
  // against to notice the other person's writes mid-session.
  const freshnessSignature = activitySignature(transactions);

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
    {
      key: "bills-due",
      count: billsDueSoon,
      label: billsDueSoon === 1 ? "bill due in the next 5 days" : "bills due in the next 5 days",
      href: "/spending/recurring",
    },
    {
      key: "low-balance",
      count: lowBalanceCount,
      label: lowBalanceCount === 1 ? "account below its balance alert" : "accounts below their balance alert",
      href: "/accounts",
    },
  ];

  return (
    <ToastProvider>
      <GlobalShortcuts />
      <ShortcutsModal />
      <FreshnessWatcher initialSignature={freshnessSignature} />
      <div className="flex min-h-full flex-1 flex-col lg:flex-row">
        <MobileNav />
        <Sidebar
          counts={navCounts}
          userEmail={user?.email ?? null}
          displayName={profile?.display_name ?? null}
          avatarUrl={profile?.avatar_url ?? null}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <OfflineQueueBanner />
          <DataQualityBanner issues={dataQualityIssues} recap={recap} />
          <main className="w-full min-w-0 flex-1 px-4 pt-10 pb-28 sm:px-6 lg:px-8 lg:pt-16 lg:pb-32">
            <PullToRefresh>
              <div className="mx-auto max-w-[1600px]">
                <PageTransition enabled={!isPhone}>{children}</PageTransition>
              </div>
            </PullToRefresh>
          </main>
        </div>
        <FinancesChat />
        <MobileTabBar
          periodId={addPeriod?.id ?? null}
          accounts={accounts.filter((a) => a.is_active)}
          categories={categories}
        />
      </div>
    </ToastProvider>
  );
}
