"use server";

import { revalidateHousehold } from "@/lib/cache";
import { createClient } from "@/lib/supabase/server";
import {
  getAccountsWithBalances,
  getCategories,
  getReconciliationsForAccount,
  getTransactionsSinceReconcile,
} from "@/lib/queries";
import type { AccountReconciliation } from "@/lib/types";

// A transaction as the reconcile sheet needs it: already signed for this
// account (so a transfer out reads negative without the sheet re-deriving the
// debt/transfer sign rules) and with the category name resolved, so the sheet
// stays self-contained and the three places that open it don't have to thread
// categories through.
export type ReconcileCandidate = {
  id: string;
  description: string;
  txnDate: string;
  signedAmount: number;
  categoryName: string | null;
  loggedByEmail: string | null;
};

export type ReconcileContext = {
  // null when the account couldn't be read — the sheet then keeps showing the
  // balance the list already had. Reporting 0 here would invite someone to log
  // an adjustment for their entire balance.
  computedBalance: number | null;
  lastReconciledAt: string | null;
  history: AccountReconciliation[];
  candidates: ReconcileCandidate[];
};

// Everything the sheet needs on open, in one round trip: what the app thinks
// the balance is right now, when it was last confirmed, and the window of
// transactions to hunt through if the entered figure disagrees.
export async function loadReconcileContext(
  accountId: string,
): Promise<ReconcileContext> {
  const [accounts, history, categories] = await Promise.all([
    getAccountsWithBalances(),
    getReconciliationsForAccount(accountId),
    getCategories(),
  ]);
  const account = accounts.find((a) => a.id === accountId);
  const last = history[0] ?? null;
  const since = last
    ? { date: last.reconciled_at.slice(0, 10), at: last.reconciled_at }
    : null;
  const transactions = await getTransactionsSinceReconcile(accountId, since);
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));

  const isDebt = account?.is_debt ?? false;
  const candidates: ReconcileCandidate[] = transactions.map((t) => {
    let signedAmount: number;
    if (t.kind === "transfer") {
      // Whichever leg lands on this account decides the direction, and a debt
      // account's "balance" runs the opposite way — paying a card down
      // reduces what's owed. Same rule as getAccountsWithBalances.
      const outgoing = t.account_id === accountId;
      const base = outgoing ? -t.amount : t.amount;
      signedAmount = isDebt ? -base : base;
    } else {
      signedAmount = t.kind === "income" ? t.amount : -t.amount;
    }
    return {
      id: t.id,
      description: t.description,
      txnDate: t.txn_date,
      signedAmount,
      categoryName: t.category_id
        ? (categoryName.get(t.category_id) ?? null)
        : null,
      loggedByEmail: t.created_by_email,
    };
  });

  return {
    computedBalance: account?.balance ?? null,
    lastReconciledAt: last?.reconciled_at ?? account?.balance_checked_at ?? null,
    history,
    candidates,
  };
}

// Records the check itself. Unlike the old version of this action, a gap is
// never logged as a "Balance adjustment" transaction — reconciling isn't
// spending, and a plug entry in Activity muddies both the category totals and
// the day's history. The gap lives on the reconciliation row instead, and
// `adjustment_amount` is what every balance calculation folds in
// (see fetchAdjustmentEvents in lib/queries.ts).
//
// Three outcomes: 'matched' (no gap), 'adjusted' (gap accepted and applied to
// the balance, with a note saying why), 'open' (gap acknowledged but left
// alone — the balance keeps disagreeing on purpose while they go hunting).
export async function recordReconciliation(input: {
  accountId: string;
  statementBalance: number;
  applyAdjustment: boolean;
  note?: string | null;
}): Promise<{ ok: boolean; error?: string; difference?: number }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const accounts = await getAccountsWithBalances();
  const account = accounts.find((a) => a.id === input.accountId);
  if (!account) return { ok: false, error: "Account not found." };

  const computed = account.balance;
  const difference =
    Math.round((input.statementBalance - computed) * 100) / 100;
  const resolution: AccountReconciliation["resolution"] =
    difference === 0 ? "matched" : input.applyAdjustment ? "adjusted" : "open";
  const at = new Date().toISOString();

  const { error } = await supabase.from("account_reconciliations").insert({
    account_id: input.accountId,
    reconciled_at: at,
    statement_balance: input.statementBalance,
    computed_balance: computed,
    difference,
    adjustment_amount: resolution === "adjusted" ? difference : 0,
    resolution,
    note: input.note?.trim() || null,
    created_by: user.id,
    created_by_email: user.email ?? null,
  });
  if (error) return { ok: false, error: error.message };

  // Denormalized "last confirmed" stamp, kept in step so the Accounts list can
  // render freshness without joining the reconcile log. Only a resolved check
  // counts as confirming the balance: leaving a gap open means the number is
  // still known to be wrong, so it must keep reading as stale.
  if (resolution !== "open") {
    const { error: stampError } = await supabase
      .from("accounts")
      .update({ balance_checked_at: at })
      .eq("id", input.accountId);
    if (stampError) return { ok: false, error: stampError.message };
  }

  revalidateHousehold(["accounts", "account_reconciliations"]);
  return { ok: true, difference };
}

// Last-four digits, set from the Accounts list so a row can be matched
// against the bank app's own list. Digits only, and never more than four —
// the full number has no business being stored.
export async function updateAccountMask(accountId: string, mask: string) {
  const supabase = await createClient();
  const digits = mask.replace(/\D/g, "").slice(-4);
  await supabase
    .from("accounts")
    .update({ account_mask: digits || null })
    .eq("id", accountId);
  revalidateHousehold(["accounts"]);
}
