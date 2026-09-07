import type { AccountType } from "@/lib/types";

// One color per account type so the Accounts grid is scannable without
// reading every badge — debt accounts always read as amber regardless of
// type, since "money owed" is the thing that matters there.
const TYPE_COLORS: Record<AccountType, string> = {
  checking: "#0d9488",
  savings: "#17b26a",
  credit_card: "#f79009",
  loan: "#f79009",
  cash: "#668091",
  investment: "#7c3aed",
  other: "#668091",
};

export function getAccountColor(accountType: AccountType | null, isDebt: boolean): string {
  if (isDebt) return "#f79009";
  return accountType ? TYPE_COLORS[accountType] : "#0d9488";
}
