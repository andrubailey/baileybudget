"use client";

import { useState, useTransition } from "react";
import { restoreTransaction } from "@/app/actions";
import { useToast } from "@/app/(app)/toast";
import { TransactionAvatar } from "@/app/(app)/transaction-row";
import { CategoryChip } from "@/app/(app)/category-chip";
import { Money } from "@/app/(app)/money";
import { formatDate } from "@/lib/format";
import {
  presentTransaction,
  toAccountLookup,
  accountLabelFor,
} from "@/lib/transaction-presentation";
import type { Account, Category, Transaction } from "@/lib/types";

export function DeletedTransactionsList({
  transactions,
  accounts,
  categories,
}: {
  transactions: Transaction[];
  accounts: Account[];
  categories: Category[];
}) {
  const [restoredIds, setRestoredIds] = useState<Set<string>>(new Set());
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const showToast = useToast();
  const accountsById = toAccountLookup(accounts);
  const categoriesById = new Map(categories.map((c) => [c.id, c]));

  function restore(t: Transaction) {
    setRestoringId(t.id);
    startTransition(async () => {
      await restoreTransaction(t.id);
      setRestoringId(null);
      // Fades the row out in place rather than waiting on the page's own
      // revalidated data — the same instant-feedback pattern the bulk
      // restore/delete toolbar uses, since a full refetch of this list on
      // every single restore would make each one feel like it takes longer
      // than it does.
      setRestoredIds((ids) => new Set(ids).add(t.id));
      showToast(`${t.description} restored`);
    });
  }

  const visible = transactions.filter((t) => !restoredIds.has(t.id));

  if (visible.length === 0) {
    return <p className="p-4 text-sm text-text-muted">Nothing deleted recently.</p>;
  }

  return (
    <>
      {visible.map((t) => {
        const presentation = presentTransaction(t, accountsById);
        const label = accountLabelFor(t, accountsById);
        const category = t.category_id ? (categoriesById.get(t.category_id) ?? null) : null;
        return (
          <div key={t.id} className="flex items-center gap-3 rounded-lg px-3 py-3">
            <TransactionAvatar label={presentation.displayDescription} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-text">{presentation.displayDescription}</p>
              <p className="text-metadata flex min-w-0 items-center gap-1.5 truncate">
                <span className="shrink-0">{formatDate(t.txn_date)}</span>
                {label && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="min-w-0 truncate">{label}</span>
                  </>
                )}
                {category && (
                  <>
                    <span aria-hidden="true">·</span>
                    <CategoryChip id={category.id} name={category.name} icon={category.icon} size="xs" showName={false} />
                    <span className="min-w-0 truncate">{category.name}</span>
                  </>
                )}
              </p>
            </div>
            <Money
              amount={t.amount}
              signDisplay={presentation.sign}
              tone={presentation.tone}
              className="text-amount shrink-0"
            />
            <button
              type="button"
              onClick={() => restore(t)}
              disabled={isPending && restoringId === t.id}
              className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text transition-colors hover:bg-bg disabled:opacity-50"
            >
              {isPending && restoringId === t.id ? "Restoring…" : "Restore"}
            </button>
          </div>
        );
      })}
    </>
  );
}
