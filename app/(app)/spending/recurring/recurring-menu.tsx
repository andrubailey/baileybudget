"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { toggleRecurringActive } from "@/app/actions";
import { MenuGlyph } from "@/app/(app)/transaction-menu";
import type { ContextMenuItem } from "@/app/(app)/context-menu";
import { useToast } from "@/app/(app)/toast";
import { formatMoney } from "@/lib/format";
import type { RecurringTransaction } from "@/lib/types";

// Right-click menu for a recurring bill or income — shared by the Recurring
// page's rows and the Spending overview's upcoming list. "Edit details"
// opens RecurringEditModal; Pause/Resume does what a row's toggle does.

export function useRecurringQuickActions() {
  const router = useRouter();
  const showToast = useToast();

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

  const toggleActive = useCallback(
    async (rule: RecurringTransaction) => {
      try {
        await toggleRecurringActive(rule.id, !rule.is_active);
        showToast(rule.is_active ? `${rule.description} paused` : `${rule.description} resumed`);
      } catch {
        showToast(`Couldn't update ${rule.description}`);
      }
    },
    [showToast],
  );

  return { router, copyText, toggleActive };
}

export function recurringMenuItems(
  rule: RecurringTransaction,
  opts: {
    onEdit: () => void;
    // The rule's account, for "View <account> transactions".
    accountName: string | null;
    actions: ReturnType<typeof useRecurringQuickActions>;
  },
): ContextMenuItem[] {
  const { router, copyText, toggleActive } = opts.actions;
  const items: ContextMenuItem[] = [
    {
      label: "Edit details",
      icon: <MenuGlyph d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Z M13.5 6.5l3 3" />,
      onSelect: opts.onEdit,
    },
    {
      // Each month's copy is logged under the rule's description.
      label: rule.kind === "income" ? "View past deposits" : "View past payments",
      icon: <MenuGlyph d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />,
      onSelect: () => router.push(`/transactions?q=${encodeURIComponent(rule.description)}&period=all`),
    },
  ];
  if (rule.account_id && opts.accountName) {
    const accountId = rule.account_id;
    items.push({
      label: `View ${opts.accountName} transactions`,
      icon: <MenuGlyph d="M3 10h18M6 6h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" />,
      onSelect: () => router.push(`/transactions?account=${accountId}&period=all`),
    });
  }
  items.push(
    { type: "divider" },
    {
      label: "Copy amount",
      icon: (
        <MenuGlyph d="M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1ZM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
      ),
      hint: formatMoney(rule.amount),
      onSelect: () => copyText(rule.amount.toFixed(2), "Amount"),
    },
    {
      label: "Copy description",
      icon: (
        <MenuGlyph d="M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1ZM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
      ),
      onSelect: () => copyText(rule.description, "Description"),
    },
    { type: "divider" },
    {
      label: rule.is_active ? "Pause" : "Resume",
      icon: rule.is_active ? <MenuGlyph d="M9 6v12M15 6v12" /> : <MenuGlyph d="M6 4v16l14-8Z" />,
      onSelect: () => toggleActive(rule),
    },
  );
  return items;
}
