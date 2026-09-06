import { Sidebar } from "./sidebar";
import { AssistantWidget } from "./assistant-widget";
import { ToastProvider } from "./toast";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <div className="flex min-h-full flex-1">
        <Sidebar />
        <main className="w-full min-w-0 flex-1 px-8 py-10">
          <div className="mx-auto max-w-[1600px]">{children}</div>
        </main>
        <AssistantWidget />
      </div>
    </ToastProvider>
  );
}
