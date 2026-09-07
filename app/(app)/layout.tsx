import { Sidebar } from "./sidebar";
import { MobileNav } from "./mobile-nav";
import { DesktopTopBar } from "./desktop-topbar";
import { AssistantWidget } from "./assistant-widget";
import { ToastProvider } from "./toast";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <ToastProvider>
      <div className="flex min-h-full flex-1 flex-col lg:flex-row">
        <MobileNav />
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <DesktopTopBar userEmail={user?.email ?? null} />
          <main className="w-full min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
            <div className="mx-auto max-w-[1600px]">{children}</div>
          </main>
        </div>
        <AssistantWidget />
      </div>
    </ToastProvider>
  );
}
