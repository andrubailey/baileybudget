// The four mobile destinations, in bottom-nav order. Paths are the app's
// existing mobile pages, so nothing had to be stubbed or moved.
export const MOBILE_ROUTES = [
  { key: "home", href: "/", label: "Home" },
  { key: "money", href: "/budget", label: "Money" },
  { key: "accounts", href: "/balances", label: "Accounts" },
  { key: "activity", href: "/recent", label: "Activity" },
] as const;

// The same four tabs on desktop, opening the full desktop pages.
export const DESKTOP_ROUTES = [
  { key: "home", href: "/", label: "Home" },
  { key: "money", href: "/spending", label: "Money" },
  { key: "accounts", href: "/accounts", label: "Accounts" },
  { key: "activity", href: "/transactions", label: "Activity" },
] as const;

export type MobileRouteKey = (typeof MOBILE_ROUTES)[number]["key"];

// "/" would otherwise match every path via startsWith.
export function isActiveTab(href: string, pathname: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
