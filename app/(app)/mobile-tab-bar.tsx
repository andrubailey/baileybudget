"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import type { Account, Category } from "@/lib/types";
import { MOBILE_LINKS, MOBILE_ADD_LINK } from "./sidebar";
import { MobileAddSheet } from "./add/mobile-add-sheet";

// Native-app-style bottom tab bar for mobile, scoped to the five jobs
// mobile is for: Overview, Budget, Accounts, Recent, Add — five flat tabs
// in a row, Add on the far right. Everything else stays desktop-only; see
// MOBILE_LINKS/MOBILE_ADD_LINK in sidebar.tsx.
const TAB_COUNT = MOBILE_LINKS.length + 1;

// "/" would otherwise match every path via startsWith — same exact-match
// carve-out the desktop dock's isActiveLink uses for its own Overview link.
function isActiveTab(href: string, pathname: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

const TAB_CLASS =
  "relative flex flex-col items-center justify-center gap-1.5 py-4 text-xs font-medium transition-colors";

export function MobileTabBar({
  periodId,
  accounts,
  categories,
}: {
  // For the Add sheet — null only if this month's period couldn't be set up.
  periodId: string | null;
  accounts: Account[];
  categories: Category[];
}) {
  const pathname = usePathname();
  const [adding, setAdding] = useState(false);
  const activeIndex = MOBILE_LINKS.findIndex((link) => isActiveTab(link.href, pathname));

  return (
    <>
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
              style={{ left: `${activeIndex * (100 / TAB_COUNT)}%`, width: `${100 / TAB_COUNT}%` }}
            />
          )}
          <div className="grid grid-cols-5">
            {MOBILE_LINKS.map((link, i) => {
              const active = isActiveTab(link.href, pathname);
              return (
                // Default prefetching, not prefetch={true}: every tab has a
                // loading.tsx, so a tap still shows that tab's skeleton
                // instantly, without fully rendering all four tab pages in
                // the background on every single page view.
                <Link
                  key={link.href}
                  href={link.href}
                  transitionTypes={
                    activeIndex === -1 || activeIndex === i
                      ? undefined
                      : [i > activeIndex ? "nav-forward" : "nav-back"]
                  }
                  className={`${TAB_CLASS} ${
                    active ? "text-accent-bright" : "text-hero-text-muted hover:text-hero-text"
                  }`}
                >
                  <svg width="27" height="27" viewBox="0 0 24 24" fill="none" className="shrink-0">
                    {link.icon}
                  </svg>
                  <span className="truncate">{link.label}</span>
                </Link>
              );
            })}
            {/* Add opens the add sheet right here as a modal, instead of
                navigating to a separate /add page. */}
            <button
              type="button"
              onClick={() => setAdding(true)}
              disabled={!periodId}
              className={`${TAB_CLASS} ${
                adding ? "text-accent-bright" : "text-hero-text-muted hover:text-hero-text"
              } disabled:opacity-40`}
            >
              <svg width="27" height="27" viewBox="0 0 24 24" fill="none" className="shrink-0">
                {MOBILE_ADD_LINK.icon}
              </svg>
              <span className="truncate">{MOBILE_ADD_LINK.label}</span>
            </button>
          </div>
        </div>
      </nav>
      {adding && periodId && (
        <MobileAddSheet
          periodId={periodId}
          accounts={accounts}
          categories={categories}
          onClose={() => setAdding(false)}
        />
      )}
    </>
  );
}
