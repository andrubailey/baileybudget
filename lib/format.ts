// No display-name field exists on these accounts (just email), so — matching
// the local-part convention already used for avatars/presence elsewhere in
// the app — this takes the piece before any "." "_" "+" or "-" separator.
export function firstNameFromEmail(email: string): string {
  const localPart = email.split("@")[0] ?? "";
  const first = localPart.split(/[._+-]/)[0] || localPart;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

export function formatMoney(value: number): string {
  // Balances are sums of many float additions, so a settled account can come
  // out as -0 or -0.0000000001, which toLocaleString prints as "-$0.00".
  // Round to the cent first, and turn any zero (including -0) into a plain 0.
  const cents = Math.round(value * 100) / 100;
  const normalized = cents === 0 ? 0 : cents;
  return normalized.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

// A debt account's balance accumulates from many float additions/subtractions
// across its transaction history, so "paid off" can land on something like
// 0.0000000001 instead of exactly 0 — still `> 0` by raw comparison, which
// showed a stray "-$0.00" (negative, still "owed") on a card that's actually
// settled. Round to the cent before treating a debt balance as owed vs. paid off.
export function isOwed(balance: number): boolean {
  return Math.round(balance * 100) / 100 > 0;
}

// A checking/savings account that's actually below zero. Rounded to the cent
// for the same reason as isOwed — a -0.004 float shouldn't read as "-$0.00".
export function isOverdrawn(balance: number): boolean {
  return Math.round(balance * 100) / 100 < 0;
}

// Formats a "YYYY-MM-DD" date string for display without shifting timezone
// (parsing as UTC keeps the day the same regardless of the viewer's locale).
export function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

// Postgres's `time` column comes back as "HH:MM:SS" — a calendar event only
// ever needs the hour and minute, in the reader's usual 12-hour format.
export function formatTime(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(Date.UTC(2000, 0, 1, hours, minutes)).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

// "Updated 3 days ago" for the mobile Accounts screen's reconcile
// timestamps — coarse on purpose (days, not hours/minutes), since the whole
// point is "is this stale enough to distrust," not a precise duration.
export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

// Red under a third of the way to goal, amber in the middle third, green in the final third.
export function progressColor(pct: number): string {
  if (pct < 33) return "var(--negative)";
  if (pct < 66) return "var(--caution)";
  return "var(--positive)";
}

// Inverse of progressColor: for "% of budget spent" style bars, where LOW is
// good and going over is bad, not the "closer to goal is better" case above.
export function spendColor(pct: number): string {
  if (pct < 70) return "var(--positive)";
  if (pct < 100) return "var(--caution)";
  return "var(--negative)";
}

// A transfer's stored description is usually generic ("Transfer") since the
// account names already say where the money went — but a transfer landing
// on a credit card is really a bill payment, and reads better labeled as
// one. Display-only: the stored description (still editable in the detail
// modal) is untouched, this just swaps what lists show for it.
export function transferDisplayDescription(
  description: string,
  kind: "income" | "expense" | "transfer",
  toAccountBank: string | null | undefined,
): string {
  if (kind === "transfer" && toAccountBank === "Amex") {
    return "American Express Payment";
  }
  return description;
}
