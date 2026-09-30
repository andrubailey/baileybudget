// Screens the mobile QA rounds cover. `tab: true` marks the ones reachable
// from the mobile tab bar at the baseline commit; the rest are reachable by
// link/search but still get used on a phone. Update this list when the
// rebuild adds, renames or removes routes — `node cli.mjs audit` reads it.

// `tabLabel` is the visible label in the bottom tab bar (used to tap it).
export const SCREENS = [
  { path: "/", label: "Overview", tab: true, tabLabel: "Overview" },
  { path: "/budget", label: "Budget (mobile tab)", tab: true, tabLabel: "Budget" },
  { path: "/balances", label: "Accounts (mobile tab)", tab: true, tabLabel: "Accounts" },
  { path: "/recent", label: "Recent (mobile tab)", tab: true, tabLabel: "Recent" },
  { path: "/add", label: "Add" },
  { path: "/calendar", label: "Calendar" },
  { path: "/transactions", label: "Transactions" },
  { path: "/spending", label: "Spending" },
  { path: "/spending/budget", label: "Budget editor" },
  { path: "/spending/recurring", label: "Recurring" },
  { path: "/accounts", label: "Accounts (full)" },
  { path: "/settings", label: "Settings" },
  { path: "/login", label: "Login", auth: false },
];

export const slug = (path) => (path === "/" ? "overview" : path.replace(/^\//, "").replace(/[/?=&]+/g, "_"));
