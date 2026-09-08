"use client";

import { useEffect, useState } from "react";

// Purely decorative — a celebration burst has no financial meaning to encode,
// so this samples across the brand + state palette for variety rather than
// picking tokens by role. #2970ff has no token of its own; it's kept literal
// as one extra hue in the mix.
const COLORS = [
  "var(--accent-bright)",
  "var(--accent)",
  "var(--positive)",
  "var(--caution)",
  "#2970ff",
  "var(--negative)",
];
const PIECE_COUNT = 28;

type Piece = { id: number; left: number; drift: number; rotate: number; delay: number; duration: number };

// Bumping `celebrationKey` (any change, e.g. an incrementing counter) fires
// one confetti burst. A hook rather than an imperative ref/method so callers
// can trigger it from a plain render-time state update, matching how the
// rest of this app already syncs local state off changed props.
export function useCelebration() {
  const [celebrationKey, setCelebrationKey] = useState(0);
  return { celebrationKey, fire: () => setCelebrationKey((k) => k + 1) };
}

// Fires a brief, purely decorative confetti burst — for moments worth
// celebrating (an objective marked Achieved, a debt account hitting $0).
// The per-piece randomization happens inside the effect (not render) since
// Math.random during render is impure and React's rules flag it; skips
// entirely under prefers-reduced-motion.
export function Celebration({ celebrationKey }: { celebrationKey: number }) {
  const [pieces, setPieces] = useState<Piece[] | null>(null);

  useEffect(() => {
    if (celebrationKey === 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- generating a fresh random burst per trigger, not syncing from a prop
    setPieces(
      Array.from({ length: PIECE_COUNT }, (_, id) => ({
        id,
        left: 38 + Math.random() * 24,
        drift: (Math.random() - 0.5) * 240,
        rotate: Math.random() * 360,
        delay: Math.random() * 150,
        duration: 900 + Math.random() * 500,
      })),
    );
    const timer = setTimeout(() => setPieces(null), 1500);
    return () => clearTimeout(timer);
  }, [celebrationKey]);

  if (!pieces) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[100] overflow-hidden" aria-hidden="true">
      {pieces.map((p, i) => (
        <span
          key={p.id}
          className="animate-confetti-piece absolute top-1/3 size-2 rounded-sm"
          style={
            {
              left: `${p.left}%`,
              backgroundColor: COLORS[i % COLORS.length],
              animationDelay: `${p.delay}ms`,
              animationDuration: `${p.duration}ms`,
              "--confetti-drift": `${p.drift}px`,
              "--confetti-rotate": `${p.rotate}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
