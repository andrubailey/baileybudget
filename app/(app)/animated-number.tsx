"use client";

import { useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/format";

// Counts from the previous value up/down to the new one over ~350ms instead
// of snapping — runs once per mount and again whenever `value` changes.
// Under 400ms so it never delays actually reading the number.
export function AnimatedMoney({ value, className }: { value: number; className?: string }) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;

    // Respected here explicitly rather than through a CSS media query —
    // this is a JS rAF loop, not a CSS animation/transition, so the
    // @media (prefers-reduced-motion: reduce) rules elsewhere in the app
    // have no way to reach it.
    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing display with an external system's current preference, not deriving render output
      setDisplay(to);
      fromRef.current = to;
      return;
    }

    const duration = 350;
    const start = performance.now();

    function tick(now: number) {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / duration);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (to - from) * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value]);

  const formatted = formatMoney(display);
  const dotIndex = formatted.indexOf(".");
  if (dotIndex === -1) return <span className={className}>{formatted}</span>;

  return (
    <span className={className}>
      {formatted.slice(0, dotIndex)}
      <span className="text-[0.6em] opacity-60">{formatted.slice(dotIndex)}</span>
    </span>
  );
}
