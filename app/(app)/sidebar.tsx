"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "@/app/actions";
import { PresenceIndicator } from "@/app/(app)/presence-indicator";
import { ProfileModal } from "@/app/(app)/profile-modal";
import { NewTransactionButton } from "@/app/(app)/new-transaction-button";
import { getAvatarColors } from "@/lib/avatar-colors";
import { CooliconPaths } from "@/app/(app)/coolicon";
import { useNotifications } from "@/app/(app)/notifications";
import { BottomNav, DESKTOP_ROUTES } from "@/components/ui";

function initialsFor(name: string) {
  return name.trim()[0]?.toUpperCase() ?? "?";
}

// The bar's four destinations, for the ⌥ shortcuts and the ⌘K page search,
// which keep each page's own name.
const PRIMARY_LINKS = [
  {
    href: "/",
    label: "Overview",
    icon: <CooliconPaths name="Custom_Dashboard" />,
  },
  {
    href: "/spending",
    label: "Spending",
    icon: <CooliconPaths name="Credit_Card_01" />,
  },
  {
    href: "/accounts",
    label: "Accounts",
    icon: <CooliconPaths name="Custom_Building" />,
  },
  {
    href: "/transactions",
    label: "Transactions",
    icon: <CooliconPaths name="File_Document" />,
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

// Desktop navigation: the same <BottomNav> as the phone, pointed at the
// desktop pages, with Search and the account menu added at the end since the
// desktop has no other home for them. Still named Sidebar since layout.tsx
// and the shared link list above are wired through this file.
export function Sidebar({
  userEmail,
  displayName,
  avatarUrl,
}: {
  userEmail?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
}) {
  const router = useRouter();
  const [profileOpen, setProfileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const notifications = useNotifications();
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

  const avatar = userEmail
    ? getAvatarColors(userEmail)
    : { bg: "var(--accent-soft)", text: "var(--accent)" };

  return (
    <>
      <BottomNav
        surface="desktop"
        routes={DESKTOP_ROUTES}
        onAdd={() => window.dispatchEvent(new CustomEvent("budgetapp:new-transaction"))}
        notifications={{ count: notifications.activeCount, onPress: notifications.open }}
        extras={
          <>
            {/* Opens the ⌘K search/chat panel — same as pressing the shortcut. */}
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent("budgetapp:open-chat"))}
              aria-label="Search"
              title={isMac ? "Search (⌘K)" : "Search (Ctrl K)"}
              className="ui-bottom-nav-tab ui-pressable"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M21 21l-4.35-4.35M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <div ref={menuRef} className="relative flex">
              <span className="pointer-events-none absolute top-1 left-1 z-10">
                <PresenceIndicator compact />
              </span>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="Account menu"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                title="Account"
                className="ui-bottom-nav-tab ui-pressable w-full"
              >
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- arbitrary user-supplied URL, not a local/known-domain asset
                  <img
                    src={avatarUrl}
                    alt=""
                    className="size-8 rounded-full object-cover"
                  />
                ) : (
                  <span
                    className="flex size-8 items-center justify-center rounded-full text-xs font-semibold"
                    style={{ backgroundColor: avatar.bg, color: avatar.text }}
                  >
                    {initialsFor(displayName || userEmail || "?")}
                  </span>
                )}
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
                      <p className="truncate text-xs text-hero-text-muted">
                        {userEmail}
                      </p>
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
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden="true"
                      >
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
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden="true"
                      >
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
          </>
        }
      />

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
