"use client";

import { useState } from "react";
import { deleteRecurringTransaction, restoreRecurringTransaction } from "@/app/actions";
import { useContextMenu } from "@/app/(app)/context-menu";
import { useToast } from "@/app/(app)/toast";
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
  const showToast = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [undoRule, setUndoRule] = useState<{ id: string; description: string } | null>(null);
  const editingRule = editingId
    ? (active.find((r) => r.rule.id === editingId) ?? paused.find((r) => r.rule.id === editingId))?.rule ?? null
    : null;
  const visibleActive = active.filter((row) => !hiddenIds.has(row.rule.id));
  const visiblePaused = paused.filter((row) => !hiddenIds.has(row.rule.id));

  function openMenu(e: React.MouseEvent, rule: RecurringTransaction) {
    contextMenu.open(
      e,
      recurringMenuItems(rule, {
        onEdit: () => setEditingId(rule.id),
        onDelete: () => handleDelete(rule),
        accountName: accounts.find((a) => a.id === rule.account_id)?.name ?? null,
        actions: recurringActions,
      }),
    );
  }

  // Mirrors the transactions list's soft-delete + timed undo toast — hide
  // the row immediately, keep it undoable for 8s, then it's gone for good.
  async function handleDelete(rule: RecurringTransaction) {
    setHiddenIds((prev) => new Set(prev).add(rule.id));
    setUndoRule({ id: rule.id, description: rule.description });
    setTimeout(() => setUndoRule((current) => (current?.id === rule.id ? null : current)), 8000);
    await deleteRecurringTransaction(rule.id);
    showToast(`${rule.description} deleted`);
  }

  async function handleUndo() {
    if (!undoRule) return;
    const { id } = undoRule;
    setUndoRule(null);
    await restoreRecurringTransaction(id);
    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    showToast("Restored");
  }

  return (
    <>
      {undoRule && (
        <div className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-accent-border bg-accent-soft px-3 py-2 text-sm">
          <span className="min-w-0 truncate text-accent">Deleted &ldquo;{undoRule.description}&rdquo;.</span>
          <button
            type="button"
            onClick={handleUndo}
            className="shrink-0 font-semibold text-accent underline underline-offset-2 hover:text-accent-bright"
          >
            Undo
          </button>
        </div>
      )}
      {visibleActive.map((row) => (
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
      {visiblePaused.length > 0 && (
        <>
          <div className="px-3 pt-4 pb-1">
            <p className="text-xs font-medium text-text-faint">Paused</p>
          </div>
          {visiblePaused.map((row) => (
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
