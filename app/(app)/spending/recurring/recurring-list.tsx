"use client";

import { useState } from "react";
import { useContextMenu } from "@/app/(app)/context-menu";
import type { AccountLookup } from "@/lib/transaction-presentation";
import type { Account, Category, RecurringTransaction } from "@/lib/types";
import { RecurringRow } from "./recurring-row";
import { recurringMenuItems, useRecurringQuickActions } from "./recurring-menu";
import { RecurringEditModal } from "./recurring-edit-modal";

type Row = {
  rule: RecurringTransaction;
  account: AccountLookup | null;
  category: { id: string; name: string; icon?: string | null } | null;
  postedThisPeriod: boolean;
};

// Owns the right-click menu and edit modal for every row on the Recurring
// page — a client wrapper around the (otherwise plain) list the server
// page builds, since both of those need state a server component can't hold.
export function RecurringList({
  active,
  paused,
  accounts,
  categories,
}: {
  active: Row[];
  paused: Row[];
  accounts: Account[];
  categories: Category[];
}) {
  const contextMenu = useContextMenu();
  const recurringActions = useRecurringQuickActions();
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingRule = editingId
    ? (active.find((r) => r.rule.id === editingId) ?? paused.find((r) => r.rule.id === editingId))?.rule ?? null
    : null;

  function openMenu(e: React.MouseEvent, rule: RecurringTransaction) {
    contextMenu.open(
      e,
      recurringMenuItems(rule, {
        onEdit: () => setEditingId(rule.id),
        accountName: accounts.find((a) => a.id === rule.account_id)?.name ?? null,
        actions: recurringActions,
      }),
    );
  }

  return (
    <>
      {active.map((row) => (
        <RecurringRow
          key={row.rule.id}
          rule={row.rule}
          account={row.account}
          category={row.category}
          postedThisPeriod={row.postedThisPeriod}
          onClick={() => setEditingId(row.rule.id)}
          onContextMenu={(e) => openMenu(e, row.rule)}
        />
      ))}
      {paused.length > 0 && (
        <>
          <div className="px-3 pt-4 pb-1">
            <p className="text-xs font-medium text-text-faint">Paused</p>
          </div>
          {paused.map((row) => (
            <RecurringRow
              key={row.rule.id}
              rule={row.rule}
              account={row.account}
              category={row.category}
              postedThisPeriod={row.postedThisPeriod}
              onContextMenu={(e) => openMenu(e, row.rule)}
            />
          ))}
        </>
      )}
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
