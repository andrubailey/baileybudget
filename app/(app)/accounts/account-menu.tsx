"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { updateAccountDetails } from "@/app/actions";
import type { ContextMenuItem } from "@/app/(app)/context-menu";
import { MenuGlyph } from "@/app/(app)/transaction-menu";
import { useToast } from "@/app/(app)/toast";
import { formatMoney } from "@/lib/format";
import type { AccountWithBalance } from "@/lib/queries";
import { BANK_LOGIN_URLS } from "@/lib/types";

// The right-click menu for an account card on the Accounts page.

const ICONS = {
  list: "M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01",
  calendar: "M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z",
  edit: "M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4",
  external: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  copy: "M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1ZM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1",
  archive: "M4 7h16M5 7v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7M9 11h6M3 4h18v3H3z",
  restore: "M4 12a8 8 0 1 0 2.3-5.6M4 4v3.5h3.5",
};

export function useAccountQuickActions() {
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

  const setActive = useCallback(
    async (a: AccountWithBalance, is_active: boolean) => {
      try {
        await updateAccountDetails(a.id, {
          name: a.name,
          goal: a.goal,
          bank: a.bank,
          account_type: a.account_type,
          login_url: a.login_url,
          low_balance_alert: a.low_balance_alert,
          is_debt: a.is_debt,
          is_active,
          is_business: a.is_business,
        });
        showToast(is_active ? `${a.name} reactivated` : `${a.name} deactivated`);
      } catch {
        showToast(`Couldn't update ${a.name}`);
      }
    },
    [showToast],
  );

  return { router, copyText, setActive };
}

export function accountMenuItems(
  a: AccountWithBalance,
  opts: {
    allTransactionsHref: string;
    loginUrl: string | null;
    // Surfaces without an edit panel (the Overview's Accounts card) leave
    // these out, and get a link to the Accounts page instead.
    onEdit?: () => void;
    // Deactivating asks for confirmation first, so the list owns that step.
    onDeactivate?: () => void;
    manageHref?: string;
    actions: ReturnType<typeof useAccountQuickActions>;
  },
): ContextMenuItem[] {
  const { router, copyText, setActive } = opts.actions;
  const items: ContextMenuItem[] = [
    {
      label: "View all transactions",
      icon: <MenuGlyph d={ICONS.list} />,
      onSelect: () => router.push(opts.allTransactionsHref),
    },
    {
      label: "This month's transactions",
      icon: <MenuGlyph d={ICONS.calendar} />,
      onSelect: () => router.push(`/transactions?account=${a.id}`),
    },
  ];
  if (opts.onEdit) {
    items.push({ label: "Edit account", icon: <MenuGlyph d={ICONS.edit} />, onSelect: opts.onEdit });
  }
  if (opts.loginUrl) {
    const loginUrl = opts.loginUrl;
    items.push({
      label: `Log in to ${a.bank ?? "bank"}`,
      icon: <MenuGlyph d={ICONS.external} />,
      onSelect: () => window.open(loginUrl, "_blank", "noopener,noreferrer"),
    });
  }
  items.push(
    { type: "divider" },
    {
      label: "Copy balance",
      icon: <MenuGlyph d={ICONS.copy} />,
      hint: formatMoney(Math.abs(a.balance)),
      onSelect: () => copyText(a.balance.toFixed(2), "Balance"),
    },
    { label: "Copy account name", icon: <MenuGlyph d={ICONS.copy} />, onSelect: () => copyText(a.name, "Account name") },
  );
  if (opts.manageHref) {
    const manageHref = opts.manageHref;
    items.push(
      { type: "divider" },
      { label: "Manage accounts", icon: <MenuGlyph d={ICONS.edit} />, onSelect: () => router.push(manageHref) },
    );
  }
  if (opts.onDeactivate) {
    items.push(
      { type: "divider" },
      a.is_active
        ? {
            label: "Deactivate account",
            icon: <MenuGlyph d={ICONS.archive} />,
            tone: "danger",
            onSelect: opts.onDeactivate,
          }
        : {
            label: "Reactivate account",
            icon: <MenuGlyph d={ICONS.restore} />,
            onSelect: () => setActive(a, true),
          },
    );
  }
  return items;
}

// An account's bank login page: its own link, or the bank's default.
export function accountLoginUrl(a: Pick<AccountWithBalance, "login_url" | "bank">): string | null {
  if (a.login_url) return a.login_url;
  if (!a.bank) return null;
  return (BANK_LOGIN_URLS as Record<string, string>)[a.bank] ?? null;
}
