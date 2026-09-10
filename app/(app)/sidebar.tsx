"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "@/app/actions";
import { PresenceIndicator } from "@/app/(app)/presence-indicator";
import { ProfileModal } from "@/app/(app)/profile-modal";
import { NewTransactionButton } from "@/app/(app)/new-transaction-button";
import { getAvatarColors } from "@/lib/avatar-colors";

function initialsFor(name: string) {
  return name.trim()[0]?.toUpperCase() ?? "?";
}

const PRIMARY_LINKS = [
  {
    href: "/",
    label: "Overview",
    icon: (
      <path
        d="M4 12h6V4H4v8Zm0 8h6v-6H4v6Zm10 0h6v-8h-6v8Zm0-16v6h6V4h-6Z"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    ),
  },
  {
    href: "/accounts",
    label: "Accounts",
    icon: (
      <path
        d="M3 10h18M6 6h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    ),
  },
  {
    href: "/transactions",
    label: "Transactions",
    icon: (
      <path
        d="M7 7h13M7 7l3-3M7 7l3 3M17 17H4M17 17l-3 3M17 17l-3-3"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    href: "/budgets",
    label: "Budget",
    icon: (
      <path
        d="M4 4h16v16H4V4Zm0 6h16M9 4v16"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    ),
  },
  {
    href: "/goals",
    label: "Goals",
    icon: (
      <path
        d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    ),
  },
  {
    href: "/reports",
    label: "Reports",
    icon: (
      <path
        d="M4 19V5m5 14V9m5 10V13m5 6V7"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    href: "/settings",
    label: "Settings",
    icon: (
      <path
        d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 1-.1 1.2l2 1.6-2 3.4-2.4-1a7.4 7.4 0 0 1-2 1.2l-.4 2.6h-4l-.4-2.6a7.4 7.4 0 0 1-2-1.2l-2.4 1-2-3.4 2-1.6a7.4 7.4 0 0 1 0-2.4l-2-1.6 2-3.4 2.4 1a7.4 7.4 0 0 1 2-1.2L9.6 3h4l.4 2.6a7.4 7.4 0 0 1 2 1.2l2.4-1 2 3.4-2 1.6c.1.4.1.8.1 1.2Z"
        stroke="currentColor"
        strokeWidth={1.3}
        strokeLinejoin="round"
      />
    ),
  },
];

export const NAV_GROUPS: {
  label: string | null;
  links: typeof PRIMARY_LINKS;
}[] = [{ label: null, links: PRIMARY_LINKS }];

// Option/Alt+1 through Option/Alt+7 jump straight to the Nth item in
// PRIMARY_LINKS from anywhere in the app. Matched by e.code (the physical
// key), not e.key — on a Mac, Option+1 types "¡" rather than "1", so keying
// off the printed character would silently break the shortcut on that
// platform, which is exactly where Option-as-modifier is most natural.
const DIGIT_CODES = [
  "Digit1",
  "Digit2",
  "Digit3",
  "Digit4",
  "Digit5",
  "Digit6",
  "Digit7",
];

// Mobile gets its own, much smaller set of destinations — not a subset of
// PRIMARY_LINKS. The idea is a phone is for quick capture and a glance at
// where things stand, not full account/transaction/budget management, so
// the bottom tab bar only has these three: log something, check the
// budget, check balances. Everything else (Transactions, Goals, Reports,
// Settings) stays desktop-only — reachable by URL/search if truly needed,
// but not part of the mobile chrome.
export const MOBILE_LINKS = [
  {
    href: "/add",
    label: "Add",
    icon: (
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    ),
  },
  {
    href: "/budget",
    label: "Budget",
    icon: (
      <path
        d="M4 4h16v16H4V4Zm0 6h16M9 4v16"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    ),
  },
  {
    href: "/balances",
    label: "Balances",
    icon: (
      <path
        d="M3 10h18M6 6h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    ),
  },
];

// Label that fades in above a dock button on hover/keyboard focus — the dock
// is icons only, so this is how you tell what each one is.
function DockTooltip({ label, hint }: { label: string; hint?: string }) {
  return (
    <span className="pointer-events-none absolute bottom-full left-1/2 mb-3 -translate-x-1/2 rounded-md border border-hero-border bg-hero-bg px-2 py-1 text-xs font-medium whitespace-nowrap text-hero-text opacity-0 shadow-modal transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">
      {label}
      {hint && <span className="ml-1.5 text-hero-text-muted">{hint}</span>}
    </span>
  );
}

// Desktop navigation: a floating, app-like dock pinned to the bottom center
// of the screen instead of a full-height left sidebar, so every page gets
// the whole width. Mobile keeps its own bottom tab bar (MobileTabBar); this
// is lg+ only. Still named Sidebar since layout.tsx and the shared link
// lists above are wired through this file.
export function Sidebar({
  counts,
  userEmail,
  displayName,
  avatarUrl,
}: {
  counts?: Record<string, number>;
  userEmail?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [profileOpen, setProfileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  // Defaults to the ⌘ glyph (matches the server-rendered HTML) and switches
  // to "Ctrl K" after mount on non-Mac platforms, to avoid a hydration
  // mismatch — `navigator` isn't available during the server render.
  const [isMac, setIsMac] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing with navigator, an external system, after mount
    setIsMac(/mac/i.test(navigator.platform || navigator.userAgent));
  }, []);

  // Global Option/Alt+1-7 page-jump shortcut — lives here because this
  // component is mounted on every page, mobile included (the dock itself is
  // just CSS-hidden below lg, not unmounted).
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const index = DIGIT_CODES.indexOf(e.code);
      if (index === -1 || index >= PRIMARY_LINKS.length) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      router.push(PRIMARY_LINKS[index].href);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [router]);

  // The account menu closes on a click anywhere outside it or on Escape. A
  // full-screen click-catcher div would be simpler, but the dock is centered
  // with a CSS transform, and a transformed ancestor turns `position: fixed`
  // children into dock-relative ones — the catcher would only cover the dock.
  useEffect(() => {
    if (!menuOpen) return;
    function handlePointerDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  // Active-page highlight slides between dock buttons instead of just
  // swapping instantly — measured off the actual rendered buttons.
  const linkRefs = useRef(new Map<string, HTMLAnchorElement>());
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);

  useEffect(() => {
    const activeLink = PRIMARY_LINKS.find((link) =>
      link.href === "/" ? pathname === "/" : pathname.startsWith(link.href),
    );
    const el = activeLink ? linkRefs.current.get(activeLink.href) : undefined;
    setPill(el ? { left: el.offsetLeft, width: el.offsetWidth } : null);
  }, [pathname]);

  const avatar = userEmail
    ? getAvatarColors(userEmail)
    : { bg: "var(--accent-soft)", text: "var(--accent)" };

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed bottom-6 left-1/2 z-40 hidden -translate-x-1/2 items-center gap-1 rounded-full border border-hero-border bg-hero-bg/50 p-1.5 shadow-modal backdrop-blur-md backdrop-saturate-150 lg:flex"
      >
        <div className="relative flex items-center gap-1">
          {pill && (
            <div
              aria-hidden="true"
              className="absolute inset-y-0 rounded-full bg-hero-bg-2 transition-[left,width] duration-200 ease-out"
              style={{ left: pill.left, width: pill.width }}
            />
          )}
          {PRIMARY_LINKS.map((link, i) => {
            const active =
              link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            const count = counts?.[link.href] ?? 0;
            return (
              <Link
                key={link.href}
                ref={(el) => {
                  if (el) linkRefs.current.set(link.href, el);
                  else linkRefs.current.delete(link.href);
                }}
                href={link.href}
                aria-label={link.label}
                aria-current={active ? "page" : undefined}
                className={`group relative z-10 flex size-10 items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-accent-bright/60 focus-visible:outline-none ${
                  active ? "text-hero-text" : "text-hero-text-muted hover:text-hero-text"
                }`}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  {link.icon}
                </svg>
                {count > 0 && (
                  <span
                    aria-label={`${count} need attention`}
                    className="absolute top-1.5 right-1.5 size-2 rounded-full bg-accent-bright ring-2 ring-hero-bg"
                  />
                )}
                <DockTooltip label={link.label} hint={`⌥${i + 1}`} />
              </Link>
            );
          })}
        </div>

        <span aria-hidden="true" className="mx-1 h-6 w-px bg-hero-border" />

        {/* Opens the ⌘K search/chat panel — same as pressing the shortcut. */}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("budgetapp:open-chat"))}
          aria-label="Search"
          className="group relative flex size-10 items-center justify-center rounded-full text-hero-text-muted transition-colors hover:bg-hero-bg-2/60 hover:text-hero-text focus-visible:ring-2 focus-visible:ring-accent-bright/60 focus-visible:outline-none"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M21 21l-4.35-4.35M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <DockTooltip label="Search" hint={isMac ? "⌘K" : "Ctrl K"} />
        </button>

        <div className="flex items-center px-1">
          <PresenceIndicator compact />
        </div>

        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Account menu"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="group relative flex size-10 items-center justify-center rounded-full transition-colors hover:bg-hero-bg-2/60 focus-visible:ring-2 focus-visible:ring-accent-bright/60 focus-visible:outline-none"
          >
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- arbitrary user-supplied URL, not a local/known-domain asset
              <img src={avatarUrl} alt="" className="size-8 rounded-full object-cover" />
            ) : (
              <span
                className="flex size-8 items-center justify-center rounded-full text-xs font-semibold"
                style={{ backgroundColor: avatar.bg, color: avatar.text }}
              >
                {initialsFor(displayName || userEmail || "?")}
              </span>
            )}
            {!menuOpen && <DockTooltip label="Account" />}
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="animate-modal-panel absolute right-0 bottom-full mb-3 w-60 overflow-hidden rounded-xl border border-hero-border bg-hero-bg p-1.5 shadow-modal"
            >
              {userEmail && (
                <div className="border-b border-hero-border px-3 pt-1.5 pb-2.5">
                  <p className="truncate text-sm font-medium text-hero-text">
                    {displayName || userEmail.split("@")[0]}
                  </p>
                  <p className="truncate text-xs text-hero-text-muted">{userEmail}</p>
                </div>
              )}
              {userEmail && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setProfileOpen(true);
                  }}
                  className="mt-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-hero-text-muted transition-colors hover:bg-hero-bg-2/60 hover:text-hero-text"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0"
                      stroke="currentColor"
                      strokeWidth={1.6}
                      strokeLinecap="round"
                    />
                  </svg>
                  Profile settings
                </button>
              )}
              <form action={signOut}>
                <button
                  type="submit"
                  role="menuitem"
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-hero-text-muted transition-colors hover:bg-hero-bg-2/60 hover:text-hero-text"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"
                      stroke="currentColor"
                      strokeWidth={1.6}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Sign out
                </button>
              </form>
            </div>
          )}
        </div>
      </nav>

      {/* Both of these render full-screen fixed overlays, so they sit outside
          the dock — inside its transformed box they'd be clipped to it. */}
      {profileOpen && userEmail && (
        <ProfileModal
          userEmail={userEmail}
          displayName={displayName ?? null}
          avatarUrl={avatarUrl ?? null}
          onClose={() => setProfileOpen(false)}
        />
      )}
      {/* Keeps ⌥E/⌥I/⌥T (and "n") reachable from every page. Renders nothing
          visible; it's the shortcut listener + the modals only. */}
      <NewTransactionButton variant="hidden" />
    </>
  );
}
