"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/transactions", label: "Transactions" },
  { href: "/categories", label: "Categories" },
  { href: "/accounts", label: "Accounts" },
  { href: "/periods", label: "Periods" },
];

export function NavLinks() {
  const pathname = usePathname();

  return (
    <>
      {NAV_LINKS.map((link) => {
        const active =
          link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`relative px-3 py-1.5 text-sm transition-colors ${
              active
                ? "text-text"
                : "text-text-muted hover:text-text"
            }`}
          >
            {link.label}
            {active && (
              <span className="absolute inset-x-3 -bottom-[1px] h-[2px] rounded-full bg-accent" />
            )}
          </Link>
        );
      })}
    </>
  );
}
