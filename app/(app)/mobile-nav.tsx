"use client";

import { PresenceIndicator } from "@/app/(app)/presence-indicator";

// Small-screen counterpart to the desktop Sidebar. Mobile only has the
// three destinations in the bottom tab bar (MobileTabBar) — nothing else
// to surface here, so this top bar is just the wordmark. Sign-out is
// desktop-sidebar-only now — not worth its own tap target on a screen this
// small for something done once in a blue moon.
export function MobileNav() {
  return (
    <div
      className="sticky top-0 z-40 flex min-h-14 shrink-0 items-center gap-2 bg-hero-bg px-4 lg:hidden"
      // No visible effect today (see the viewport-fit=cover comment in
      // app/layout.tsx — this only ever renders nonzero once the page is
      // rendering edge-to-edge under the status bar), but this is the one
      // sticky-to-viewport-top element in the app, so it gets the same
      // defensive inset the bottom bars already have.
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <span className="truncate text-base font-bold tracking-tight text-hero-text">
        Bailey <span className="text-accent">Budget</span>
      </span>
      <PresenceIndicator compact />
    </div>
  );
}
