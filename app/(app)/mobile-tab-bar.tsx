"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MOBILE_LINKS } from "./sidebar";

// Native-app-style bottom tab bar for mobile — just the three things mobile
// is actually for (log something, check the budget, check balances), not a
// subset of the desktop sidebar's full page list. Everything else stays
// desktop-only; see MOBILE_LINKS in sidebar.tsx.
export function MobileTabBar() {
  const pathname = usePathname();
  const activeIndex = MOBILE_LINKS.findIndex((link) =>
    pathname.startsWith(link.href),
  );

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 border-t border-hero-border bg-hero-bg lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {/* Slides between tabs instead of the active state just swapping
          color instantly — same idea as the desktop sidebar's active pill. */}
      {activeIndex !== -1 && (
        <div
          aria-hidden="true"
          className="absolute top-0 h-0.5 bg-accent-bright transition-[left] duration-200 ease-out"
          style={{ left: `${activeIndex * (100 / 3)}%`, width: `${100 / 3}%` }}
        />
      )}
      {MOBILE_LINKS.map((link, i) => {
        const active = pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            prefetch={true}
            transitionTypes={
              activeIndex === -1 || activeIndex === i
                ? undefined
                : [i > activeIndex ? "nav-forward" : "nav-back"]
            }
            className={`relative flex flex-col items-center justify-center gap-1.5 py-4 text-xs font-medium transition-colors ${
              active
                ? "text-accent-bright"
                : "text-hero-text-muted hover:text-hero-text"
            }`}
          >
            <svg
              width="27"
              height="27"
              viewBox="0 0 24 24"
              fill="none"
              className="shrink-0"
            >
              {link.icon}
            </svg>
            <span className="truncate">{link.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
