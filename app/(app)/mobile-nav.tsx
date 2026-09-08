"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/actions";
import { MOBILE_MORE_LINKS } from "./sidebar";
import { LogoMark } from "@/app/(app)/logo-mark";
import { PresenceIndicator } from "@/app/(app)/presence-indicator";
import { NewTransactionButton } from "@/app/(app)/new-transaction-button";

// Small-screen counterpart to the desktop Sidebar. The 5 most-used pages
// live in the bottom tab bar (MobileTabBar) now, so this top bar's "More"
// button only needs to surface the long tail — the remaining pages, New
// transaction, and sign out — in a slide-in drawer.
export function MobileNav({ counts }: { counts?: Record<string, number> }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Auto-close the drawer whenever the route changes (link tap navigates,
  // then this cleans up rather than leaving the drawer stuck open). Adjusting
  // state during render on a prop/param change is the pattern React's docs
  // recommend over an effect for this — it avoids an extra render pass.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  // Lock body scroll while the drawer is open so the page behind it doesn't
  // scroll along with the drawer's own content on touch devices.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <div className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between bg-hero-bg px-4 lg:hidden">
      <div className="flex min-w-0 items-center gap-2">
        <LogoMark size={28} />
        <span className="truncate text-base font-bold tracking-tight text-hero-text">
          Bailey<span className="text-accent">Budget</span>
        </span>
        <PresenceIndicator compact />
      </div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="More"
        className="flex size-11 shrink-0 items-center justify-center rounded-lg text-hero-text-muted hover:bg-hero-bg-2/60 hover:text-hero-text"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-hero-bg shadow-modal">
            <div className="flex h-14 shrink-0 items-center justify-between px-4">
              <span className="truncate text-base font-bold tracking-tight text-hero-text">More</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="flex size-11 items-center justify-center rounded-lg text-hero-text-muted hover:bg-hero-bg-2/60 hover:text-hero-text"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M6 6l12 12M18 6 6 18"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>

            <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-4 py-2">
              <div className="mb-2">
                <NewTransactionButton menuPosition="below" />
              </div>

              {MOBILE_MORE_LINKS.map((link) => {
                const active =
                  link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
                const count = counts?.[link.href] ?? 0;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`flex items-center gap-3 rounded-lg px-3 py-3 text-[15px] font-medium transition-colors ${
                      active
                        ? "bg-hero-bg-2 text-hero-text"
                        : "text-hero-text-muted hover:bg-hero-bg-2/60 hover:text-hero-text"
                    }`}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="shrink-0">
                      {link.icon}
                    </svg>
                    <span className="truncate">{link.label}</span>
                    {count > 0 && (
                      <span className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-accent-bright px-1.5 text-xs font-semibold text-hero-bg">
                        {count}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>

            <div className="shrink-0 px-4 py-4">
              <form action={signOut}>
                <button
                  type="submit"
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-hero-text-muted hover:bg-hero-bg-2/60 hover:text-hero-text"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="shrink-0">
                    <path
                      d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"
                      stroke="currentColor"
                      strokeWidth={1.6}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span>Sign out</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
