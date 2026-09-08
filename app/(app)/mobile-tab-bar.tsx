"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MOBILE_TAB_LINKS } from "./sidebar";

// Native-app-style bottom tab bar for mobile — replaces the hamburger menu
// as the primary way to move between pages, since a thumb-reachable row of
// icons at the bottom is faster than opening a drawer for the 5 pages used
// most. Everything else lives one tap away in the mobile "More" menu.
export function MobileTabBar({ counts }: { counts?: Record<string, number> }) {
  const pathname = usePathname();
  const activeIndex = MOBILE_TAB_LINKS.findIndex((link) =>
    link.href === "/" ? pathname === "/" : pathname.startsWith(link.href),
  );

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-hero-border bg-hero-bg lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {/* Slides between tabs instead of the active state just swapping
          color instantly — same idea as the desktop sidebar's active pill. */}
      {activeIndex !== -1 && (
        <div
          aria-hidden="true"
          className="absolute top-0 h-0.5 bg-accent-bright transition-[left] duration-200 ease-out"
          style={{ left: `${activeIndex * 20}%`, width: "20%" }}
        />
      )}
      {MOBILE_TAB_LINKS.map((link) => {
        const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
        const count = counts?.[link.href] ?? 0;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`relative flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
              active ? "text-accent-bright" : "text-hero-text-muted hover:text-hero-text"
            }`}
          >
            <span className="relative">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="shrink-0">
                {link.icon}
              </svg>
              {count > 0 && (
                <span className="absolute -top-1 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-bright px-1 text-[10px] font-semibold text-hero-bg">
                  {count}
                </span>
              )}
            </span>
            <span className="truncate">{link.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
