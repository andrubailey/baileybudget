import { signOut } from "@/app/actions";
import { NavLinks } from "./nav-links";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-border bg-surface/80 backdrop-blur supports-[backdrop-filter]:bg-surface/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="font-display flex items-baseline gap-1.5 text-[1.05rem] tracking-tight">
            <span className="text-accent">＊</span>
            <span>Household</span>
            <span className="italic text-text-muted">Budget</span>
          </span>
          <nav className="flex items-center gap-0.5">
            <NavLinks />
            <form action={signOut}>
              <button
                type="submit"
                className="ml-3 rounded-full border border-border px-3 py-1 text-xs text-text-muted transition-colors hover:border-accent hover:text-text"
              >
                Sign out
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        {children}
      </main>
    </div>
  );
}
