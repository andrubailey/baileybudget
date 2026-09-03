import Link from "next/link";
import { signOut } from "@/app/actions";

const NAV_LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/transactions", label: "Transactions" },
  { href: "/categories", label: "Categories" },
  { href: "/accounts", label: "Accounts" },
  { href: "/periods", label: "Periods" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-black/10 dark:border-white/10">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <span className="font-semibold">Household Budget</span>
          <nav className="flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-md px-3 py-1.5 text-sm text-black/70 hover:bg-black/5 dark:text-white/70 dark:hover:bg-white/10"
              >
                {link.label}
              </Link>
            ))}
            <form action={signOut}>
              <button
                type="submit"
                className="ml-2 rounded-md px-3 py-1.5 text-sm text-black/50 hover:bg-black/5 dark:text-white/50 dark:hover:bg-white/10"
              >
                Sign out
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        {children}
      </main>
    </div>
  );
}
