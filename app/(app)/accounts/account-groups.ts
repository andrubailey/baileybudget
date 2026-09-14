import type { AccountWithBalance } from "@/lib/queries";

// Preferred display order for the Personal group — checking first as the
// day-to-day account, then the two savings goals in the order they matter
// most. Anything not in this list (a new personal account added later)
// just falls after these, alphabetically.
const PERSONAL_ACCOUNT_ORDER = ["Personal Checking", "Car Maintenance Fund", "Emergency Fund"];

function byPersonalOrder(a: AccountWithBalance, b: AccountWithBalance) {
  const ai = PERSONAL_ACCOUNT_ORDER.indexOf(a.name);
  const bi = PERSONAL_ACCOUNT_ORDER.indexOf(b.name);
  if (ai !== -1 && bi !== -1) return ai - bi;
  if (ai !== -1) return -1;
  if (bi !== -1) return 1;
  return a.name.localeCompare(b.name);
}

export type AccountGroup = {
  key: "business" | "personal" | "debt";
  label: string;
  accounts: AccountWithBalance[];
};

// Business, Personal, then Debt — debt accounts pulled into their own group
// regardless of which side they're on ("what you have" vs. "what you owe").
// Shared by the Overview's Accounts card and the mobile Accounts tab so the
// two always categorize accounts the same way. Empty groups are dropped.
export function groupAccounts(accounts: AccountWithBalance[]): AccountGroup[] {
  const groups: AccountGroup[] = [
    {
      key: "business",
      label: "Business",
      accounts: accounts
        .filter((a) => !a.is_debt && a.is_business)
        .sort((a, b) => a.name.localeCompare(b.name)),
    },
    {
      key: "personal",
      label: "Personal",
      accounts: accounts.filter((a) => !a.is_debt && !a.is_business).sort(byPersonalOrder),
    },
    {
      key: "debt",
      label: "Debt",
      accounts: accounts.filter((a) => a.is_debt).sort((a, b) => a.name.localeCompare(b.name)),
    },
  ];
  return groups.filter((g) => g.accounts.length > 0);
}
