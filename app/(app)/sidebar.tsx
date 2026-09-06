"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/actions";

// Daily-use pages first; setup/maintenance pages grouped under their own
// label so the nav doesn't read as 7 equally-weighted items.
const PRIMARY_LINKS = [
  {
    href: "/",
    label: "Dashboard",
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
    href: "/recurring",
    label: "Recurring",
    icon: (
      <path
        d="M4 12a8 8 0 0 1 14.5-4.5M20 12a8 8 0 0 1-14.5 4.5M17 4v4h-4M7 20v-4h4"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    href: "/planning",
    label: "Planning",
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
    href: "/calendar",
    label: "Calendar",
    icon: (
      <path
        d="M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    href: "/weekly-recap",
    label: "Weekly Recap",
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
];

const MANAGE_LINKS = [
  {
    href: "/categories",
    label: "Categories",
    icon: (
      <path
        d="M11.05 3.5H6.5A3 3 0 0 0 3.5 6.5v4.55c0 .53.21 1.04.59 1.41l8.9 8.9a2 2 0 0 0 2.82 0l4.55-4.55a2 2 0 0 0 0-2.82l-8.9-8.9a2 2 0 0 0-1.41-.59Z M7.5 8a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1Z"
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
    href: "/import",
    label: "Import",
    icon: (
      <path
        d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
];

const NAV_GROUPS: { label: string | null; links: typeof PRIMARY_LINKS }[] = [
  { label: null, links: PRIMARY_LINKS },
  { label: "Manage", links: MANAGE_LINKS },
];

const COLLAPSE_KEY = "sidebar-collapsed";

export function Sidebar() {
  const pathname = usePathname();
  // Starts expanded (matching the server-rendered HTML) and reads the saved
  // preference after mount, to avoid a hydration mismatch.
  const [collapsed, setCollapsed] = useState(false);

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

  return (
    <aside
      className={`sticky top-0 flex h-screen shrink-0 flex-col bg-hero-bg transition-[width] duration-150 ${
        collapsed ? "w-[72px]" : "w-64"
      }`}
    >
      <div className="flex h-[72px] shrink-0 items-center gap-2 px-5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-sm font-bold text-white">
          B
        </span>
        {!collapsed && (
          <span className="truncate text-lg font-bold tracking-tight text-hero-text">
            Bailey<span className="text-accent">Budget</span>
          </span>
        )}
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-4 py-2">
        {NAV_GROUPS.map((group, groupIndex) => (
          <div key={group.label ?? groupIndex} className={groupIndex > 0 ? "mt-4" : undefined}>
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
                link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
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
                  {!collapsed && <span className="truncate">{link.label}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="shrink-0 px-4 py-4">
        <button
          type="button"
          onClick={toggle}
          title={collapsed ? "Expand" : "Collapse"}
          className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-hero-text-muted transition-colors hover:bg-hero-bg-2/60 hover:text-hero-text ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            className={`shrink-0 transition-transform ${collapsed ? "rotate-180" : ""}`}
          >
            <path
              d="M15 5 8 12l7 7"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {!collapsed && <span>Collapse</span>}
        </button>

        <a
          href="/api/export"
          title={collapsed ? "Export data" : undefined}
          className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-hero-text-muted transition-colors hover:bg-hero-bg-2/60 hover:text-hero-text ${
            collapsed ? "justify-center" : ""
          }`}
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
          {!collapsed && <span>Export data</span>}
        </a>

        <form action={signOut}>
          <button
            type="submit"
            title={collapsed ? "Sign out" : undefined}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-hero-text-muted transition-colors hover:bg-hero-bg-2/60 hover:text-hero-text ${
              collapsed ? "justify-center" : ""
            }`}
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
            {!collapsed && <span>Sign out</span>}
          </button>
        </form>
      </div>
    </aside>
  );
}
