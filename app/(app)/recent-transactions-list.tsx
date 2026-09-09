"use client";

import { useMemo, useState } from "react";
import { formatMoney, formatDate } from "@/lib/format";
import { getLetterColors } from "@/lib/letter-colors";
import type { Account, Category, Transaction } from "@/lib/types";
import { TransactionDetailModal } from "@/app/(app)/transaction-detail-modal";

type Group = { key: string; label: string; transactions: Transaction[] };

// Client-side so a row click can open the same TransactionDetailModal the
// full Transactions page uses, instead of the Overview page's Recent
// Transactions list being read-only.
export function RecentTransactionsList({
  groups,
  accounts,
  categories,
}: {
  groups: Group[];
  accounts: Account[];
  categories: Category[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detailClosing, setDetailClosing] = useState(false);

  const accountById = useMemo(
    () => new Map(accounts.map((a) => [a.id, a.name])),
    [accounts],
  );
  const allTransactions = useMemo(
    () => groups.flatMap((g) => g.transactions),
    [groups],
  );
  // Every distinct person who's logged one of these transactions — backs
  // the detail modal's "Created by" dropdown, same as the Transactions page.
  const knownCreators = useMemo(() => {
    const byEmail = new Map<string, { id: string | null; email: string }>();
    for (const t of allTransactions) {
      if (t.created_by_email) {
        byEmail.set(t.created_by_email, { id: t.created_by, email: t.created_by_email });
      }
    }
    return Array.from(byEmail.values());
  }, [allTransactions]);

  function closeDetail() {
    setDetailClosing(true);
    setTimeout(() => {
      setEditingId(null);
      setDetailClosing(false);
    }, 150);
  }

  const detailTransaction = editingId
    ? (allTransactions.find((t) => t.id === editingId) ?? null)
    : null;

  return (
    <>
      <div className="space-y-5">
        {(() => {
          let rowIndex = 0;
          return groups.map((group) => (
            <div key={group.key}>
              <p className="mb-2.5 text-[11px] font-semibold tracking-wide text-text-faint uppercase">
                {group.label}
              </p>
              <div className="divide-y divide-border">
                {group.transactions.map((t) => {
                  const i = rowIndex++;
                  const avatar = getLetterColors(t.description);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setEditingId(t.id)}
                      style={{ animationDelay: `${i * 35}ms` }}
                      className="animate-fade-in-up -mx-3 flex w-[calc(100%+1.5rem)] items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-bg"
                    >
                      <span
                        className="flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                        style={{ backgroundColor: avatar.bg, color: avatar.text }}
                      >
                        {t.description.trim()[0]?.toUpperCase() ?? "?"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-text">
                          {t.description}
                        </p>
                        <p className="truncate text-xs text-text-faint">
                          {formatDate(t.txn_date)}
                        </p>
                      </div>
                      <span
                        className={`tabular ml-4 shrink-0 text-sm font-medium ${
                          t.kind === "income" ? "text-success" : "text-text"
                        }`}
                      >
                        {t.kind === "income" ? "+" : t.kind === "expense" ? "-" : ""}
                        {formatMoney(t.amount)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ));
        })()}
      </div>

      {detailTransaction && (
        <TransactionDetailModal
          transaction={detailTransaction}
          accounts={accounts}
          categories={categories}
          knownCreators={knownCreators}
          accountName={
            detailTransaction.account_id
              ? (accountById.get(detailTransaction.account_id) ?? "—")
              : "—"
          }
          toAccountName={
            detailTransaction.to_account_id
              ? (accountById.get(detailTransaction.to_account_id) ?? "—")
              : null
          }
          closing={detailClosing}
          onClose={closeDetail}
        />
      )}
    </>
  );
}
