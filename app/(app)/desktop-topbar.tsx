"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "@/app/actions";
import { getAvatarColors } from "@/lib/avatar-colors";

function initialsFor(email: string) {
  return email.trim()[0]?.toUpperCase() ?? "?";
}

// Desktop counterpart to the reference design's top bar — search, quick
// utility icons, and an avatar menu — sitting above the page content instead
// of folded into the sidebar. Mobile already has its own compact top bar
// (MobileNav), so this only renders at lg: and up.
export function DesktopTopBar({ userEmail }: { userEmail: string | null }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    router.push(q ? `/transactions?q=${encodeURIComponent(q)}` : "/transactions");
  }

  const avatar = userEmail ? getAvatarColors(userEmail) : { bg: "#ecfccb", text: "#5b8a00" };

  return (
    <div className="sticky top-0 z-30 hidden h-[72px] shrink-0 items-center gap-4 border-b border-border bg-surface px-8 lg:flex">
      <form onSubmit={handleSearchSubmit} className="max-w-xs flex-1">
        <div className="relative">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-faint"
          >
            <path
              d="m21 21-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search transactions…"
            className="w-full rounded-lg border border-border bg-bg py-2 pr-3 pl-9 text-sm text-text outline-none transition-colors focus:border-accent"
          />
        </div>
      </form>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <a
          href="/api/export"
          title="Export data"
          aria-label="Export data"
          className="flex size-10 items-center justify-center rounded-full border border-border text-text-muted hover:bg-bg"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </a>
        <a
          href="/settings"
          title="Settings"
          aria-label="Settings"
          className="flex size-10 items-center justify-center rounded-full border border-border text-text-muted hover:bg-bg"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 1-.1 1.2l2 1.6-2 3.4-2.4-1a7.4 7.4 0 0 1-2 1.2l-.4 2.6h-4l-.4-2.6a7.4 7.4 0 0 1-2-1.2l-2.4 1-2-3.4 2-1.6a7.4 7.4 0 0 1 0-2.4l-2-1.6 2-3.4 2.4 1a7.4 7.4 0 0 1 2-1.2L9.6 3h4l.4 2.6a7.4 7.4 0 0 1 2 1.2l2.4-1 2 3.4-2 1.6c.1.4.1.8.1 1.2Z"
              stroke="currentColor"
              strokeWidth={1.3}
              strokeLinejoin="round"
            />
          </svg>
        </a>

        {userEmail && (
          <div ref={menuRef} className="relative ml-1">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="flex items-center gap-2 rounded-full border border-border py-1 pr-2 pl-1 hover:bg-bg"
            >
              <span
                className="flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                style={{ backgroundColor: avatar.bg, color: avatar.text }}
              >
                {initialsFor(userEmail)}
              </span>
              <span className="max-w-[140px] truncate text-left text-sm font-medium text-text">
                {userEmail.split("@")[0]}
              </span>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                className={`shrink-0 text-text-faint transition-transform ${menuOpen ? "rotate-180" : ""}`}
              >
                <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {menuOpen && (
              <div className="absolute top-[calc(100%+8px)] right-0 z-40 w-56 rounded-xl border border-border bg-surface p-1.5 shadow-modal">
                <div className="border-b border-border px-3 py-2">
                  <p className="truncate text-sm font-medium text-text">{userEmail}</p>
                </div>
                <a
                  href="/settings"
                  className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-muted hover:bg-bg hover:text-text"
                >
                  Settings
                </a>
                <form action={signOut}>
                  <button
                    type="submit"
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-text-muted hover:bg-bg hover:text-text"
                  >
                    Sign out
                  </button>
                </form>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
