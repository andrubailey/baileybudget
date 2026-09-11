"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/spending", label: "Overview" },
  { href: "/spending/breakdown", label: "Breakdown & budget" },
  { href: "/transactions", label: "Transactions" },
  { href: "/spending/recurring", label: "Recurring" },
  { href: "/spending/reports", label: "Reports" },
];

// Sub-navigation for the Spending section. The overview and the full
// transactions table are two views of the same section, so they share one
// tab row instead of being separate dock items.
export function SpendingTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Spending" className="flex items-center gap-1">
      {TABS.map((tab) => {
        const active =
          tab.href === "/spending" ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              active
                ? "bg-surface text-text shadow-card ring-1 ring-border"
                : "text-text-muted hover:bg-bg hover:text-text"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
