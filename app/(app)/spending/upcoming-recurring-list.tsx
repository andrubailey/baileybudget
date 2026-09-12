"use client";

import { useState } from "react";
import { formatDate, formatMoney } from "@/lib/format";
import { TransactionAvatar } from "@/app/(app)/transaction-row";
import { useContextMenu } from "@/app/(app)/context-menu";
import type { Account, Category, RecurringTransaction } from "@/lib/types";
import { recurringMenuItems, useRecurringQuickActions } from "./recurring/recurring-menu";
import { RecurringEditModal } from "./recurring/recurring-edit-modal";

// The bill list under the Spending overview's "Upcoming transactions"
// calendar. Right-clicking a bill opens the same menu as the Recurring page.
export function UpcomingRecurringList({
  items,
  accounts,
  categories,
}: {
  items: (RecurringTransaction & { iso: string })[];
  accounts: Account[];
  categories: Category[];
}) {
  const contextMenu = useContextMenu();
  const recurringActions = useRecurringQuickActions();
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingRule = editingId ? (items.find((r) => r.id === editingId) ?? null) : null;

  return (
    <>
      <ul className="mt-4 divide-y divide-border">
        {items.map((r) => (
          <li
            key={`${r.id}-${r.iso}`}
            onContextMenu={(e) =>
              contextMenu.open(
                e,
                recurringMenuItems(r, {
                  accountName: accounts.find((a) => a.id === r.account_id)?.name ?? null,
                  onEdit: () => setEditingId(r.id),
                  actions: recurringActions,
                }),
              )
            }
            className="flex items-center gap-3 py-2.5"
          >
            <TransactionAvatar label={r.description} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-text">{r.description}</p>
              <p className="text-metadata">{formatDate(r.iso)}</p>
            </div>
            <span
              className={`tabular shrink-0 text-sm font-medium ${
                r.kind === "income" ? "text-positive" : "text-text"
              }`}
            >
              {r.kind === "income" ? "+" : ""}
              {formatMoney(r.amount)}
            </span>
          </li>
        ))}
      </ul>
      {contextMenu.menu}
      {editingRule && (
        <RecurringEditModal
          rule={editingRule}
          accounts={accounts}
          categories={categories}
          onClose={() => setEditingId(null)}
          onSaved={() => setEditingId(null)}
        />
      )}
    </>
  );
}
