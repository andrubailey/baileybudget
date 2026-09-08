import { Sidebar } from "./sidebar";
import { MobileNav } from "./mobile-nav";
import { MobileBottomBar } from "./mobile-bottom-bar";
import { ToastProvider } from "./toast";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Best-effort: a nav badge count should never take down every page in the
  // app if the query fails (e.g. a migration not yet run in this database).
  const { count: pendingApprovalCount, error: pendingApprovalError } = await supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("pending_approval", true)
    .is("deleted_at", null);
  if (pendingApprovalError) {
    console.error("pending_approval count query failed:", pendingApprovalError);
  }

  const navCounts = { "/transactions": pendingApprovalError ? 0 : (pendingApprovalCount ?? 0) };

  return (
    <ToastProvider>
      <div className="flex min-h-full flex-1 flex-col lg:flex-row">
        <MobileNav counts={navCounts} />
        <Sidebar counts={navCounts} userEmail={user?.email ?? null} />
        <div className="flex min-w-0 flex-1 flex-col">
          <main className="w-full min-w-0 flex-1 px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:py-10 lg:pb-10">
            <div className="mx-auto max-w-[1600px]">{children}</div>
          </main>
        </div>
        <MobileBottomBar />
      </div>
    </ToastProvider>
  );
}
