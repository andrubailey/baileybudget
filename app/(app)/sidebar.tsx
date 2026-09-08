"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "@/app/actions";
import { LogoMark } from "@/app/(app)/logo-mark";
import { PresenceIndicator } from "@/app/(app)/presence-indicator";
import { NewTransactionButton } from "@/app/(app)/new-transaction-button";
import { getAvatarColors } from "@/lib/avatar-colors";

function initialsFor(email: string) {
  return email.trim()[0]?.toUpperCase() ?? "?";
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
    label: "Budgets",
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
    href: "/investments",
    label: "Investments",
    icon: (
      <path
        d="M3 17 9 11l4 4 8-8M21 7h-6m6 0v6"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
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

const COLLAPSE_KEY = "sidebar-collapsed";

export function Sidebar({
  counts,
  userEmail,
}: {
  counts?: Record<string, number>;
  userEmail?: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  // Starts expanded (matching the server-rendered HTML) and reads the saved
  // preference after mount, to avoid a hydration mismatch.
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(COLLAPSE_KEY) === "1";
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing with localStorage, an external system, after mount
      setCollapsed(saved);
    } catch {
      // ignore — localStorage unavailable
    }
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }

  const avatar = userEmail
    ? getAvatarColors(userEmail)
    : { bg: "#ecfccb", text: "#5b8a00" };

  return (
    <aside
      className={`sticky top-0 hidden h-screen shrink-0 flex-col bg-hero-bg transition-[width] duration-150 lg:flex ${
        collapsed ? "w-[72px]" : "w-64"
      }`}
    >
      <div
        className={`flex h-[72px] shrink-0 items-center gap-2 px-5 ${collapsed ? "justify-center" : ""}`}
      >
        <LogoMark size={32} />
        <span
          className={`overflow-hidden truncate text-lg font-bold tracking-tight text-hero-text transition-[max-width,opacity] duration-150 ${
            collapsed ? "max-w-0 opacity-0" : "max-w-[160px] flex-1 opacity-100"
          }`}
        >
          Bailey<span className="text-accent">Budget</span>
        </span>
        <button
          type="button"
          onClick={toggle}
          title={collapsed ? "Expand" : "Collapse"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-hero-text-muted transition-colors hover:bg-hero-bg-2 hover:text-hero-text"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            className={`shrink-0 transition-transform ${collapsed ? "rotate-180" : ""}`}
          >
            <path
              d="M15 5 8 12l7 7"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {!collapsed && (
        <div className="px-5 pb-2">
          <PresenceIndicator />
        </div>
      )}

      {!collapsed && (
        <div className="px-5 pb-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              router.push(
                search
                  ? `/transactions?q=${encodeURIComponent(search)}`
                  : "/transactions",
              );
            }}
          >
            <label className="relative block">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-hero-text-muted"
              >
                <path
                  d="M21 21l-4.35-4.35M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z"
                  stroke="currentColor"
                  strokeWidth={1.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="w-full rounded-lg bg-hero-bg-2 py-2 pr-3 pl-9 text-sm text-hero-text placeholder:text-hero-text-muted outline-none focus:ring-2 focus:ring-accent-bright/60"
              />
            </label>
          </form>
        </div>
      )}

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-4 py-2">
        {NAV_GROUPS.map((group, groupIndex) => (
          <div
            key={group.label ?? groupIndex}
            className={groupIndex > 0 ? "mt-4" : undefined}
          >
            {group.label && !collapsed && (
              <p className="px-3 pb-1 text-[11px] font-semibold tracking-wide text-hero-text-muted uppercase">
                {group.label}
              </p>
            )}
            {group.label && collapsed && (
              <div className="mx-3 mb-2 border-t border-hero-border" />
            )}
            {group.links.map((link) => {
              const active =
                link.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(link.href);
              const count = counts?.[link.href] ?? 0;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  title={collapsed ? link.label : undefined}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-medium transition-colors ${
                    active
                      ? "bg-hero-bg-2 text-hero-text"
                      : "text-hero-text-muted hover:bg-hero-bg-2/60 hover:text-hero-text"
                  } ${collapsed ? "justify-center" : ""}`}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    className="shrink-0"
                  >
                    {link.icon}
                  </svg>
                  <span
                    className={`overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-150 ${
                      collapsed
                        ? "max-w-0 opacity-0"
                        : "max-w-[160px] opacity-100"
                    }`}
                  >
                    {link.label}
                  </span>
                  {!collapsed && count > 0 && (
                    <span className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-accent-bright px-1.5 text-xs font-semibold text-hero-bg">
                      {count}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="shrink-0 px-4 py-4">
        <div className="mb-2">
          <NewTransactionButton collapsed={collapsed} menuPosition="above" />
        </div>

        {userEmail && (
          <div
            title={collapsed ? userEmail : undefined}
            className={`mb-1 flex items-center gap-3 rounded-lg px-3 py-2.5 ${
              collapsed ? "justify-center" : ""
            }`}
          >
            <span
              className="flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
              style={{ backgroundColor: avatar.bg, color: avatar.text }}
            >
              {initialsFor(userEmail)}
            </span>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-hero-text">
                  {userEmail.split("@")[0]}
                </p>
                <p className="truncate text-xs text-hero-text-muted">
                  {userEmail}
                </p>
              </div>
            )}
          </div>
        )}

        <form action={signOut}>
          <button
            type="submit"
            title={collapsed ? "Sign out" : undefined}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-hero-text-muted transition-colors hover:bg-hero-bg-2/60 hover:text-hero-text ${
              collapsed ? "justify-center" : ""
            }`}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              className="shrink-0"
            >
              <path
                d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"
                stroke="currentColor"
                strokeWidth={1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {!collapsed && <span>Sign out</span>}
          </button>
        </form>
      </div>
    </aside>
  );
}
