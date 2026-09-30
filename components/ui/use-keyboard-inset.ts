"use client";

import { useEffect, useState } from "react";

// How many CSS px of the layout viewport the on-screen keyboard currently
// covers, measured from the visualViewport rather than inferred from a
// window resize (iOS never resizes the window for the keyboard, and the
// numeric keypad is a different height than the full keyboard). 0 when no
// keyboard is open or the browser has no visualViewport.
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const covered = window.innerHeight - viewport.height - viewport.offsetTop;
        // Browser toolbars collapsing cover a sliver; a keyboard (even the
        // numeric keypad, even in landscape) covers far more.
        setInset(covered > window.innerHeight * 0.12 ? Math.round(covered) : 0);
      });
    };
    measure();
    viewport.addEventListener("resize", measure);
    viewport.addEventListener("scroll", measure);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", measure);
      viewport.removeEventListener("scroll", measure);
    };
  }, []);

  return inset;
}
