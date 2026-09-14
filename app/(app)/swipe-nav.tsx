"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { MOBILE_LINKS } from "./sidebar";
import { isActiveTab } from "./mobile-tab-bar";

// How far (px) a drag has to travel before release commits to changing
// tabs, vs. springing back to where it started.
const COMMIT_DISTANCE = 70;
// Clamp on how far the page can be dragged while there's a tab in that
// direction to go to.
const MAX_DRAG = 120;
// Divisor applied past that clamp (dragging toward an edge with no tab
// beyond it) — same rubber-band idea as iOS's own edge resistance, so the
// drag still visibly responds but makes clear there's nowhere further to go.
const EDGE_RESISTANCE = 4;

// Swipe left/right anywhere on a mobile tab page to move to the adjacent
// tab, iOS-style — left goes to the next tab (Overview -> Budget -> Accounts
// -> Recent), right goes back. Only ever arms once a touch is clearly more
// horizontal than vertical, so it stays out of the way of normal scrolling
// and PullToRefresh's own vertical gesture (neither component stops
// propagation, so both simply get the same touch stream and each decides
// for itself whether to act on it). A no-op anywhere that isn't one of the
// four mobile tabs — most importantly /transactions, whose mobile card rows
// have their own swipe-to-delete gesture this must never contend with.
export function SwipeNav({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const activeIndex = MOBILE_LINKS.findIndex((link) => isActiveTab(link.href, pathname));

  const startRef = useRef<{ x: number; y: number } | null>(null);
  // null = still deciding whether this touch is a horizontal nav gesture;
  // true = committed to one (and is now dragging); false = yielded to
  // whatever the browser/PullToRefresh does with it instead.
  const armedRef = useRef<boolean | null>(null);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing with an external system's current preference, not deriving render output
    setReducedMotion(mq.matches);
  }, []);

  function reset() {
    startRef.current = null;
    armedRef.current = null;
    setDragging(false);
    setDragX(0);
  }

  function handleTouchStart(e: React.TouchEvent) {
    if (e.touches.length !== 1) return;
    startRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    armedRef.current = null;
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (!startRef.current || e.touches.length !== 1) return;
    const deltaX = e.touches[0].clientX - startRef.current.x;
    const deltaY = e.touches[0].clientY - startRef.current.y;

    if (armedRef.current === null) {
      if (Math.hypot(deltaX, deltaY) < 10) return;
      armedRef.current = Math.abs(deltaX) > Math.abs(deltaY) * 1.3;
      if (armedRef.current) setDragging(true);
    }
    if (!armedRef.current) return;

    const hasTarget = deltaX > 0 ? activeIndex > 0 : activeIndex < MOBILE_LINKS.length - 1;
    const eased = hasTarget ? deltaX : deltaX / EDGE_RESISTANCE;
    setDragX(Math.max(-MAX_DRAG, Math.min(MAX_DRAG, eased)));
  }

  function handleTouchEnd() {
    if (!armedRef.current) {
      reset();
      return;
    }
    const goingBack = dragX > 0; // dragged right = toward the previous tab
    const targetIndex = goingBack ? activeIndex - 1 : activeIndex + 1;
    const committed =
      Math.abs(dragX) >= COMMIT_DISTANCE && targetIndex >= 0 && targetIndex < MOBILE_LINKS.length;

    if (!committed) {
      reset();
      return;
    }

    const target = MOBILE_LINKS[targetIndex];
    if (!reducedMotion) {
      // Carries the drag the rest of the way off-screen in the direction
      // it was already going, instead of snapping back — reads as "swiped
      // away," even though the incoming page is just the app's usual fade
      // (see page-transition.tsx: every nav resolves to the same fade,
      // direction alone doesn't get its own slide).
      setDragX(goingBack ? window.innerWidth : -window.innerWidth);
    }
    router.push(target.href, { transitionTypes: [goingBack ? "nav-back" : "nav-forward"] });
    setTimeout(reset, reducedMotion ? 0 : 220);
  }

  // Off a mobile tab entirely (e.g. /transactions, reached via search) —
  // nothing to swipe to, so don't even attach the listeners.
  if (activeIndex === -1) return <>{children}</>;

  return (
    <div onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd} onTouchCancel={reset}>
      <div
        style={reducedMotion ? undefined : { transform: `translateX(${dragX}px)` }}
        className={dragging ? "" : "transition-transform duration-200 ease-out"}
      >
        {children}
      </div>
    </div>
  );
}
