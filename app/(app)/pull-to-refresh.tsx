"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";

const PULL_THRESHOLD = 64;
const MAX_PULL = 96;

// Installed as a PWA (see manifest.json / appleWebApp in layout.tsx), a
// home-screen launch runs standalone with no browser chrome — which means
// no native pull-to-refresh either, unlike a normal mobile browser tab.
// This reimplements the gesture: pulling down while already scrolled to the
// very top re-fetches the current page's server data.
export function PullToRefresh({ children }: { children: React.ReactNode }) {
  const [pull, setPull] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  // This component lives in the persistent layout, so it never unmounts
  // between page navigations — a touch gesture that starts and then gets
  // interrupted mid-drag by a client-side route change (rather than ending
  // with a normal touchend) used to leave `pull`/`isDragging` stuck at a
  // nonzero value forever, pinning a "↓" indicator open on every page after.
  // Resetting on every navigation guarantees a clean start on the new page.
  useEffect(() => {
    startY.current = null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing drag state with the router, an external system, after a navigation
    setIsDragging(false);
    setPull(0);
  }, [pathname]);

  function resetGesture() {
    setIsDragging(false);
    startY.current = null;
    setPull(0);
  }

  function handleTouchStart(e: React.TouchEvent) {
    if (window.scrollY > 0 || refreshing) {
      startY.current = null;
      return;
    }
    startY.current = e.touches[0].clientY;
    setIsDragging(true);
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (startY.current === null) return;
    const delta = e.touches[0].clientY - startY.current;
    setPull(delta > 0 ? Math.min(MAX_PULL, delta * 0.5) : 0);
  }

  function handleTouchEnd() {
    setIsDragging(false);
    startY.current = null;
    if (pull >= PULL_THRESHOLD) {
      setRefreshing(true);
      setPull(PULL_THRESHOLD);
      router.refresh();
      // router.refresh() doesn't expose a "done" promise, so this is an
      // approximation of typical fetch time rather than a precise signal.
      setTimeout(() => {
        setRefreshing(false);
        setPull(0);
      }, 700);
    } else {
      setPull(0);
    }
  }

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      // Fires when the browser cancels a touch sequence outright (e.g. an
      // in-progress gesture interrupted by a navigation, an OS gesture, or a
      // scroll taking over) — without this, that case never reaches
      // handleTouchEnd and the drag state above is the only thing that ever
      // clears it.
      onTouchCancel={resetGesture}
    >
      <div
        className="flex items-center justify-center overflow-hidden lg:hidden"
        style={{
          height: pull,
          transition: isDragging ? "none" : "height 200ms ease-out",
        }}
      >
        <span className={`text-xs text-text-faint ${refreshing ? "animate-spin" : ""}`}>
          {refreshing ? "↻" : pull >= PULL_THRESHOLD ? "Release to refresh" : "↓"}
        </span>
      </div>
      {children}
    </div>
  );
}
