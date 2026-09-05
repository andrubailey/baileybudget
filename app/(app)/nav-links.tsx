"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/transactions", label: "Transactions" },
  { href: "/categories", label: "Categories" },
  { href: "/accounts", label: "Accounts" },
];

export function NavLinks() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1">
      {NAV_LINKS.map((link) => {
        const active =
          link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-md px-3 py-2 text-[15px] font-semibold transition-colors ${
              active
                ? "bg-accent-soft text-accent"
                : "text-text-muted hover:bg-bg"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
