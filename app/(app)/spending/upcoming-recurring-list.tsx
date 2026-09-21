"use client";

import { useState } from "react";
import { deleteRecurringTransaction, restoreRecurringTransaction } from "@/app/actions";
import { formatDate, formatMoney } from "@/lib/format";
import { TransactionAvatar } from "@/app/(app)/transaction-row";
import { useContextMenu } from "@/app/(app)/context-menu";
import { useToast } from "@/app/(app)/toast";
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
  const showToast = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [undoRule, setUndoRule] = useState<{ id: string; description: string } | null>(null);
  const editingRule = editingId ? (items.find((r) => r.id === editingId) ?? null) : null;
  const visibleItems = items.filter((r) => !hiddenIds.has(r.id));

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
        <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-accent-border bg-accent-soft px-3 py-2 text-sm">
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
      <ul className="mt-4 divide-y divide-border">
        {visibleItems.map((r) => (
          <li
            key={`${r.id}-${r.iso}`}
            onContextMenu={(e) =>
              contextMenu.open(
                e,
                recurringMenuItems(r, {
                  accountName: accounts.find((a) => a.id === r.account_id)?.name ?? null,
                  onEdit: () => setEditingId(r.id),
                  onDelete: () => handleDelete(r),
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
          onDelete={() => {
            setEditingId(null);
            handleDelete(editingRule);
          }}
        />
      )}
    </>
  );
}
