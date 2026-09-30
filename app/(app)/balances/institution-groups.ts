import type { AccountWithBalance } from "@/lib/queries";

// A balance nobody has confirmed against the bank in a week is not evidence.
// Same threshold the reconcile action uses.
export const STALE_AFTER_DAYS = 7;

export function isStale(checkedAt: string | null): boolean {
  if (!checkedAt) return true;
  const days = (Date.now() - new Date(checkedAt).getTime()) / 86_400_000;
  return days >= STALE_AFTER_DAYS;
}

export type InstitutionGroup = {
  key: string;
  label: string;
  accounts: AccountWithBalance[];
  hasStale: boolean;
};

// Grouped by institution, because that's how reconciling actually happens:
// open one bank's app, work down its accounts, move to the next. The old
// Business/Personal/Debt split cut across that — a Chase personal checking and
// a Chase business checking sat in different cards despite being two taps
// apart in the same bank app.
export function groupByInstitution(
  accounts: AccountWithBalance[],
): InstitutionGroup[] {
  const groups = new Map<string, InstitutionGroup>();
  for (const account of accounts) {
    const label = account.bank?.trim() || "Other";
    const existing = groups.get(label);
    if (existing) {
      existing.accounts.push(account);
      existing.hasStale ||= isStale(account.balance_checked_at);
    } else {
      groups.set(label, {
        key: label,
        label,
        accounts: [account],
        hasStale: isStale(account.balance_checked_at),
      });
    }
  }

  // Follows the manual ordering already set on the accounts themselves rather
  // than inventing a second one; unbanked accounts fall to the end.
  return [...groups.values()]
    .map((g) => ({
      ...g,
      accounts: g.accounts.slice().sort((a, b) => a.sort_order - b.sort_order),
    }))
    .sort((a, b) => {
      if (a.label === "Other") return 1;
      if (b.label === "Other") return -1;
      return a.accounts[0].sort_order - b.accounts[0].sort_order;
    });
}
