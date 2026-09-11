"use client";

import { useCallback } from "react";
import { bulkUpdateTransactions, toggleTransactionPendingApproval } from "@/app/actions";
import { formatMoney } from "@/lib/format";
import { presentTransaction, type AccountLookup } from "@/lib/transaction-presentation";
import type { Account, Category, Transaction } from "@/lib/types";
import type { ContextMenuItem } from "@/app/(app)/context-menu";
import { BankLogo } from "@/app/(app)/accounts/bank-logo";
import { CategoryChip } from "@/app/(app)/category-chip";
import { useToast } from "@/app/(app)/toast";

// The right-click menu for a transaction, shared by the Transactions table
// and the Overview's Recent Transactions card so both offer exactly the
// same options. Each surface supplies what only it knows: how to open the
// detail panel, how it handles delete + undo, and (the table only) selection.

type EditablePatch = { account_id?: string | null; category_id?: string | null };

// Line icon for a menu item, in the menu's muted color.
export function MenuGlyph({ d }: { d: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="text-text-faint">
      <path d={d} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Quick edits from the menu. `setLocalEdit` shows the change immediately;
// it's rolled back (patch = null) if the save fails.
export function useTransactionQuickActions(
  setLocalEdit: (id: string, patch: EditablePatch | null) => void,
) {
  const showToast = useToast();

  const quickUpdate = useCallback(
    async (t: Transaction, patch: EditablePatch, message: string) => {
      setLocalEdit(t.id, patch);
      const result = await bulkUpdateTransactions([t.id], patch);
      if (!result.ok) {
        setLocalEdit(t.id, null);
        showToast(result.error ? `Couldn't update: ${result.error}` : "Couldn't update transaction");
        return;
      }
      showToast(message);
    },
    [setLocalEdit, showToast],
  );

  const copyText = useCallback(
    async (text: string, what: string) => {
      try {
        await navigator.clipboard.writeText(text);
        showToast(`${what} copied`);
      } catch {
        showToast(`Couldn't copy ${what.toLowerCase()}`);
      }
    },
    [showToast],
  );

  const approve = useCallback(
    (t: Transaction) => {
      toggleTransactionPendingApproval(t.id, false);
      showToast("Approved");
    },
    [showToast],
  );

  return { quickUpdate, copyText, approve };
}

export function transactionMenuItems(
  t: Transaction,
  opts: {
    accountsById: ReadonlyMap<string, AccountLookup>;
    accounts: Account[];
    categories: Category[];
    isSplit?: boolean;
    isDeleting?: boolean;
    onOpen: () => void;
    onDelete: () => void;
    // Only the table has row selection.
    selection?: { selected: boolean; toggle: () => void };
    actions: ReturnType<typeof useTransactionQuickActions>;
  },
): ContextMenuItem[] {
  const { accountsById, accounts, categories, isSplit, isDeleting, onOpen, onDelete, selection, actions } = opts;
  const p = presentTransaction(t, accountsById);
  const isTransfer = t.kind === "transfer";
  const categoryKind = p.effectiveKind === "income" ? "income" : "expense";

  return [
    {
      label: "Open details",
      icon: <MenuGlyph d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Zm9.5 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />,
      onSelect: onOpen,
    },
    ...(t.pending_approval
      ? [{ label: "Approve", icon: <MenuGlyph d="M5 13l4 4L19 7" />, onSelect: () => actions.approve(t) } as ContextMenuItem]
      : []),
    { type: "divider" },
    {
      label: "Change category",
      icon: <MenuGlyph d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9-9-9Zm4.5-4.5h.01" />,
      disabled: isTransfer || !!isSplit,
      submenu: categories
        .filter((c) => c.kind === categoryKind && c.is_active !== false)
        .map((c) => ({
          label: c.name,
          checked: t.category_id === c.id,
          icon: <CategoryChip id={c.id} name={c.name} icon={c.icon} size="xs" showName={false} />,
          onSelect: () => {
            if (t.category_id !== c.id) actions.quickUpdate(t, { category_id: c.id }, `Moved to ${c.name}`);
          },
        })),
    },
    {
      label: "Change account",
      icon: <MenuGlyph d="M3 10h18M6 6h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" />,
      disabled: isTransfer,
      submenu: accounts
        .filter((a) => a.is_active !== false)
        .map((a) => ({
          label: a.name,
          checked: t.account_id === a.id,
          icon: a.bank ? <BankLogo bank={a.bank} size="sm" /> : undefined,
          onSelect: () => {
            if (t.account_id !== a.id) actions.quickUpdate(t, { account_id: a.id }, `Moved to ${a.name}`);
          },
        })),
    },
    { type: "divider" },
    ...(selection
      ? [
          {
            label: selection.selected ? "Deselect" : "Select",
            icon: <MenuGlyph d="M4 5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5Zm4.5 7 2.5 2.5 4.5-5" />,
            onSelect: selection.toggle,
          } as ContextMenuItem,
        ]
      : []),
    {
      label: "Copy amount",
      icon: <MenuGlyph d="M9 9h10v10H9zM5 15V5h10" />,
      hint: formatMoney(t.amount),
      onSelect: () => actions.copyText(t.amount.toFixed(2), "Amount"),
    },
    {
      label: "Copy description",
      icon: <MenuGlyph d="M9 9h10v10H9zM5 15V5h10" />,
      onSelect: () => actions.copyText(p.displayDescription, "Description"),
    },
    { type: "divider" },
    {
      label: "Delete",
      tone: "danger",
      icon: <MenuGlyph d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />,
      disabled: isDeleting,
      onSelect: onDelete,
    },
  ];
}
