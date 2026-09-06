import { signOut } from "@/app/actions";
import { NavLinks } from "./nav-links";
import { AssistantWidget } from "./assistant-widget";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-[72px] max-w-[1600px] items-center justify-between px-8">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-sm font-bold text-white">
              H
            </span>
            <span className="text-lg font-bold tracking-tight text-text">
              household<span className="text-accent">budget</span>
            </span>
          </div>
          <NavLinks />
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text-muted transition-colors hover:bg-bg"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1600px] flex-1 px-8 py-10">
        {children}
      </main>
      <AssistantWidget />
    </div>
  );
}
