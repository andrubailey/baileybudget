"use client";

import { ViewTransition } from "react";
import { usePathname } from "next/navigation";

// Uses React's ViewTransition (the browser View Transitions API) instead of a
// CSS entrance animation. The old page fades out and the new one fades in the
// moment you click — a CSS animation on the new page could only start once
// its data had arrived, which read as a pause and then a jump.
//
// Desktop only (`enabled` is false for phones — decided on the server from
// the user agent, so the server and client render the same tree and nothing
// remounts after hydration). On a phone, every navigation snapshotting the
// whole screen made tab switches feel slow, and a quick second tap
// interrupted the running transition mid-fade and left the page flickering
// or blank. Without a ViewTransition in the tree React never starts one, so
// phone pages just swap instantly.
//
// Direction comes from the nav links' `transitionTypes` (see the dock in
// sidebar.tsx): "nav-forward" / "nav-back", resolving to the same fade.
// The key only changes on a real route change, so router.refresh() after a
// save doesn't animate the page.
export function PageTransition({
  children,
  enabled = true,
}: {
  children: React.ReactNode;
  enabled?: boolean;
}) {
  const pathname = usePathname();
  if (!enabled) return <div>{children}</div>;
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
