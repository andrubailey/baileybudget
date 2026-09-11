"use client";

import { ViewTransition } from "react";
import { usePathname } from "next/navigation";

// Uses React's ViewTransition (the browser View Transitions API) instead of a
// CSS entrance animation. The old page slides out and the new one slides in
// as one motion the moment you click — a CSS animation on the new page could
// only start once its data had arrived, which read as a pause and then a jump.
//
// Direction comes from the nav links' `transitionTypes` (see the dock in
// sidebar.tsx and MobileTabBar): "nav-forward" for a page further along the
// menu, "nav-back" for an earlier one. Navigations without a type (browser
// back/forward, keyboard shortcuts) get a plain crossfade. The key only
// changes on a real route change, so router.refresh() after a save doesn't
// animate the page.
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <ViewTransition
      key={pathname}
      enter={{ "nav-forward": "nav-forward", "nav-back": "nav-back", default: "page-fade" }}
      exit={{ "nav-forward": "nav-forward", "nav-back": "nav-back", default: "page-fade" }}
      default="none"
    >
      <div>{children}</div>
    </ViewTransition>
  );
}
