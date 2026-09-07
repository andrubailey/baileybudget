import { Sidebar } from "./sidebar";
import { MobileNav } from "./mobile-nav";
import { AssistantWidget } from "./assistant-widget";
import { ToastProvider } from "./toast";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <div className="flex min-h-full flex-1 flex-col lg:flex-row">
        <MobileNav />
        <Sidebar />
        <main className="w-full min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
          <div className="mx-auto max-w-[1600px]">{children}</div>
        </main>
        <AssistantWidget />
      </div>
    </ToastProvider>
  );
}
