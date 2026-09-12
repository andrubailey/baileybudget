"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MOBILE_LINKS, MOBILE_ADD_LINK } from "./sidebar";

// Native-app-style bottom tab bar for mobile, scoped to the five jobs
// mobile is for: Overview, Budget, Accounts, Recent, Add — five flat tabs
// in a row, Add on the far right. Everything else stays desktop-only; see
// MOBILE_LINKS/MOBILE_ADD_LINK in sidebar.tsx.
const TABS = [...MOBILE_LINKS, MOBILE_ADD_LINK];

// "/" would otherwise match every path via startsWith — same exact-match
// carve-out the desktop dock's isActiveLink uses for its own Overview link.
function isActiveTab(href: string, pathname: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function MobileTabBar() {
  const pathname = usePathname();
  const activeIndex = TABS.findIndex((link) => isActiveTab(link.href, pathname));

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="relative border-t border-hero-border bg-hero-bg">
        {/* Slides between tabs instead of the active state just swapping
            color instantly — same idea as the desktop sidebar's active pill. */}
        {activeIndex !== -1 && (
          <div
            aria-hidden="true"
            className="absolute top-0 h-0.5 bg-accent-bright transition-[left] duration-200 ease-out"
            style={{ left: `${activeIndex * (100 / TABS.length)}%`, width: `${100 / TABS.length}%` }}
          />
        )}
        <div className="grid grid-cols-5">
          {TABS.map((link, i) => {
            const active = isActiveTab(link.href, pathname);
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
                <svg width="27" height="27" viewBox="0 0 24 24" fill="none" className="shrink-0">
                  {link.icon}
                </svg>
                <span className="truncate">{link.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
