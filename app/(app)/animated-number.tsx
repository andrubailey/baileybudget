"use client";

import { useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/format";

// Counts from the previous value up/down to the new one over ~600ms instead
// of snapping — runs once per mount and again whenever `value` changes.
export function AnimatedMoney({ value, className }: { value: number; className?: string }) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;

    const duration = 600;
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
