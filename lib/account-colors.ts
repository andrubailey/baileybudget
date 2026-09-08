import type { AccountType } from "@/lib/types";

// One color per account type so the Accounts grid is scannable without
// reading every badge — debt accounts always read as amber regardless of
// type, since "money owed" is the thing that matters there. Reuses the same
// hues as the semantic financial-state palette (globals.css) rather than a
// separate arbitrary set — savings genuinely is "positive," debt genuinely
// is "caution," so borrowing those tokens' values keeps the whole app's
// color vocabulary to one considered palette instead of two.
const TYPE_COLORS: Record<AccountType, string> = {
  checking: "#3f6e7d",
  savings: "#4a7a3e",
  credit_card: "#9c6b1f",
  loan: "#9c6b1f",
  cash: "#7a7266",
  investment: "#6b5490",
  other: "#7a7266",
};

export function getAccountColor(accountType: AccountType | null, isDebt: boolean): string {
  if (isDebt) return "#9c6b1f";
  return accountType ? TYPE_COLORS[accountType] : "#3f6e7d";
}
