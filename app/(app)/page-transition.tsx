"use client";

import { usePathname } from "next/navigation";

// Next's App Router swaps page content instantly on navigation — no visual
// acknowledgment that anything happened. Keying on the pathname forces a
// remount on every route change, replaying the fade-in-up entrance so
// navigating between pages feels like a deliberate transition instead of a
// hard cut. Respects prefers-reduced-motion via the animation's own rule in
// globals.css.
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="animate-fade-in-up">
      {children}
    </div>
  );
}
