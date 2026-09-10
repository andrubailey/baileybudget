import { transferDisplayDescription } from "@/lib/format";
import type { Account, Transaction } from "@/lib/types";

// Every list in the app (dashboard recent list, the transactions table and
// its mobile cards, ⌘K results) used to decide on its own how a transaction
// reads — which sign to show, which color. This is the one place that
// decision is made.
export type TransactionPresentation = {
  // What the row calls the transaction — transfers into a credit card show
  // as a bill payment, everything else is the stored description.
  displayDescription: string;
  effectiveKind: "income" | "expense" | "transfer";
  // Reserved for a future badge; always null for now — rows show the
  // stored kind as-is.
  kindLabel: null;
  // Sign and color for the amount. Income lands (+, positive); spending is
  // routine, not a problem (−, neutral); transfers are neither.
  sign: "+" | "-" | "none";
  tone: "positive" | "neutral";
  isDebtAccount: boolean;
};

export type AccountLookup = Pick<Account, "id" | "name" | "bank" | "is_debt">;

export function presentTransaction(
  t: Pick<Transaction, "kind" | "description" | "account_id" | "to_account_id">,
  accountsById: ReadonlyMap<string, AccountLookup>,
): TransactionPresentation {
  const account = t.account_id ? accountsById.get(t.account_id) : undefined;
  const toAccount = t.to_account_id ? accountsById.get(t.to_account_id) : undefined;
  const isDebtAccount = account?.is_debt ?? false;

  const displayDescription = transferDisplayDescription(
    t.description,
    t.kind,
    toAccount?.bank ?? null,
  );

  if (t.kind === "transfer") {
    return {
      displayDescription,
      effectiveKind: "transfer",
      kindLabel: null,
      sign: "none",
      tone: "neutral",
      isDebtAccount,
    };
  }

  return {
    displayDescription,
    effectiveKind: t.kind,
    kindLabel: null,
    sign: t.kind === "income" ? "+" : "-",
    tone: t.kind === "income" ? "positive" : "neutral",
    isDebtAccount,
  };
}

// "Checking → Emergency Fund" for a transfer, just the account name
// otherwise — the at-a-glance "which account did this touch" label.
export function accountLabelFor(
  t: Pick<Transaction, "kind" | "account_id" | "to_account_id">,
  accountsById: ReadonlyMap<string, AccountLookup>,
): string | null {
  if (t.kind === "transfer") {
    const parts = [t.account_id, t.to_account_id]
      .map((id) => (id ? accountsById.get(id)?.name : null))
      .filter(Boolean);
    return parts.length > 0 ? parts.join(" → ") : null;
  }
  return t.account_id ? (accountsById.get(t.account_id)?.name ?? null) : null;
}

export function toAccountLookup<T extends AccountLookup>(
  accounts: readonly T[],
): Map<string, AccountLookup> {
  return new Map(accounts.map((a) => [a.id, a]));
}
