"use client";

import { signOut } from "@/app/actions";
import { PresenceIndicator } from "@/app/(app)/presence-indicator";

// Small-screen counterpart to the desktop Sidebar. Mobile only has the
// three destinations in the bottom tab bar (MobileTabBar) — nothing else
// to surface here, so this top bar is just the wordmark and a sign-out
// button rather than a "More" drawer of pages that no longer exist on
// mobile.
export function MobileNav() {
  return (
    <div className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between bg-hero-bg px-4 lg:hidden">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-base font-bold tracking-tight text-hero-text">
          Bailey <span className="text-accent">Budget</span>
        </span>
        <PresenceIndicator compact />
      </div>
      <form action={signOut}>
        <button
          type="submit"
          aria-label="Sign out"
          title="Sign out"
          className="flex size-11 shrink-0 items-center justify-center rounded-lg text-hero-text-muted transition-colors hover:bg-hero-bg-2/60 hover:text-hero-text"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path
              d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </form>
    </div>
  );
}
