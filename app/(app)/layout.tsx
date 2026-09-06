import { Sidebar } from "./sidebar";
import { AssistantWidget } from "./assistant-widget";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1">
      <Sidebar />
      <main className="w-full min-w-0 flex-1 px-8 py-10">{children}</main>
      <AssistantWidget />
    </div>
  );
}
