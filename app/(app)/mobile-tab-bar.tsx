"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Account, Category } from "@/lib/types";
import { MOBILE_LINKS, MOBILE_ADD_LINK } from "./sidebar";
import { MobileAddSheet } from "./add/mobile-add-sheet";

// "/" would otherwise match every path via startsWith — same exact-match
// carve-out the desktop dock's isActiveLink uses for its own Overview link.
// Exported so SwipeNav can find "which tab, if any, is this page" using the
// exact same rule this bar uses to highlight itself.
export function isActiveTab(href: string, pathname: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

// Shared "glass" surface for the capsule and the Add button: translucent,
// blurred, with a faint light edge and a soft floating shadow — the iOS 27
// floating tab bar look.
const GLASS =
  "border border-white/15 bg-hero-bg/55 shadow-[0_10px_30px_-8px_rgba(0,0,0,0.45)] backdrop-blur-2xl backdrop-saturate-[1.8]";

// Mobile navigation as a floating capsule (iOS 27 style) instead of a bar
// pinned edge to edge: Overview, Budget, Accounts and Recent in one pill,
// with a highlight that slides behind the active tab, and Add as its own
// round button beside it that opens the add sheet in place.
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
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const activeIndex = MOBILE_LINKS.findIndex((link) => isActiveTab(link.href, pathname));

  return (
    <>
      <nav
        aria-label="Main"
        // --mobile-tabbar-gap here is the same token globals.css's
        // --content-bottom-safe adds on top of this bar's own height — the
        // two have to move together or the page's bottom padding and this
        // bar's own bottom gap drift out of sync.
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 lg:hidden"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + var(--mobile-tabbar-gap))" }}
      >
        <div className="flex items-center gap-2">
          <div className={`pointer-events-auto relative flex-1 rounded-full p-1 ${GLASS}`}>
            {activeIndex !== -1 && (
              <div
                aria-hidden="true"
                className="absolute inset-y-1 rounded-full bg-white/12 transition-[left] duration-300 ease-out"
                style={{
                  left: `calc(0.25rem + ${activeIndex} * (100% - 0.5rem) / ${MOBILE_LINKS.length})`,
                  width: `calc((100% - 0.5rem) / ${MOBILE_LINKS.length})`,
                }}
              />
            )}
            <div className="relative grid" style={{ gridTemplateColumns: `repeat(${MOBILE_LINKS.length}, 1fr)` }}>
              {MOBILE_LINKS.map((link, i) => {
                const active = i === activeIndex;
                return (
                  // Default prefetching, not prefetch={true}: every tab has a
                  // loading.tsx, so a tap still shows that tab's skeleton
                  // instantly, without fully rendering all four tab pages in
                  // the background on every single page view.
                  <Link
                    key={link.href}
                    href={link.href}
                    // Start fetching the page as soon as a finger touches
                    // the tab rather than on release, so the new page is
                    // usually already on its way by the time the tap lands.
                    onPointerDown={() => router.prefetch(link.href)}
                    aria-current={active ? "page" : undefined}
                    transitionTypes={
                      activeIndex === -1 || active ? undefined : [i > activeIndex ? "nav-forward" : "nav-back"]
                    }
                    className={`flex flex-col items-center justify-center gap-0.5 rounded-full py-2 text-[10px] font-semibold transition-colors ${
                      active ? "text-accent-bright" : "text-hero-text-muted active:text-hero-text"
                    }`}
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="shrink-0">
                      {link.icon}
                    </svg>
                    <span className="truncate">{link.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setAdding(true)}
            disabled={!periodId}
            aria-label="Add transaction"
            className={`pointer-events-auto flex size-[3.75rem] shrink-0 items-center justify-center rounded-full text-accent-bright transition-transform active:scale-95 disabled:opacity-40 ${GLASS}`}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="shrink-0">
              {MOBILE_ADD_LINK.icon}
            </svg>
          </button>
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
