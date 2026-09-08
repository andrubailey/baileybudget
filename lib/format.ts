// No display-name field exists on these accounts (just email), so — matching
// the local-part convention already used for avatars/presence elsewhere in
// the app — this takes the piece before any "." "_" "+" or "-" separator.
export function firstNameFromEmail(email: string): string {
  const localPart = email.split("@")[0] ?? "";
  const first = localPart.split(/[._+-]/)[0] || localPart;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

export function formatMoney(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
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
