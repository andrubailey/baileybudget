"use server";

import { getRecentTransactionsForAccount } from "@/lib/queries";
import type { Transaction } from "@/lib/types";

// Loaded on demand when an account's detail panel opens, rather than
// fetching every account's recent history on every dashboard load.
export async function fetchAccountTransactions(
  accountId: string,
): Promise<Transaction[]> {
  return getRecentTransactionsForAccount(accountId, 8);
}
