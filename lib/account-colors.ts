import type { AccountType } from "@/lib/types";

// Accounts stay neutral by default — the bank logo already identifies each
// one, so a rainbow of per-type colors was decoration, not information.
// Color only shows up here for the one type of account that genuinely needs
// a signal: debt reads as caution amber regardless of type, since "money
// owed" is the fact that actually matters.
const NEUTRAL = "#7a7266";

export function getAccountColor(accountType: AccountType | null, isDebt: boolean): string {
  if (isDebt) return "#d68f0a";
  return NEUTRAL;
}
