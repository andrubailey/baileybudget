"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/actions";
import { NAV_GROUPS } from "./sidebar";

// Small-screen counterpart to the desktop Sidebar: a sticky top bar with a
// hamburger button that opens a full-height slide-in drawer, since a
// permanent 256px-wide sidebar has no room to exist on a phone.
export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Auto-close the drawer whenever the route changes (link tap navigates,
  // then this cleans up rather than leaving the drawer stuck open).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

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
      <div className="flex items-center gap-2">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent text-xs font-bold text-white">
          B
        </span>
        <span className="truncate text-base font-bold tracking-tight text-hero-text">
          Bailey<span className="text-accent">Budget</span>
        </span>
      </div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="flex size-9 items-center justify-center rounded-lg text-hero-text-muted hover:bg-hero-bg-2/60 hover:text-hero-text"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path
            d="M4 6h16M4 12h16M4 18h16"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
          />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-hero-bg shadow-xl">
            <div className="flex h-14 shrink-0 items-center justify-between px-4">
              <span className="truncate text-base font-bold tracking-tight text-hero-text">
                Bailey<span className="text-accent">Budget</span>
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="flex size-9 items-center justify-center rounded-lg text-hero-text-muted hover:bg-hero-bg-2/60 hover:text-hero-text"
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
              {NAV_GROUPS.map((group, groupIndex) => (
                <div key={group.label ?? groupIndex} className={groupIndex > 0 ? "mt-4" : undefined}>
                  {group.label && (
                    <p className="px-3 pb-1 text-[11px] font-semibold tracking-wide text-hero-text-muted uppercase">
                      {group.label}
                    </p>
                  )}
                  {group.links.map((link) => {
                    const active =
                      link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
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
                      </Link>
                    );
                  })}
                </div>
              ))}
            </nav>

            <div className="shrink-0 px-4 py-4">
              <a
                href="/api/export"
                className="mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-hero-text-muted hover:bg-hero-bg-2/60 hover:text-hero-text"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="shrink-0">
                  <path
                    d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14"
                    stroke="currentColor"
                    strokeWidth={1.6}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span>Export data</span>
              </a>
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
