"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { deleteBudgetLine, updateCategoryActive, updateCategoryIcon } from "@/app/actions";
import { formatMoney } from "@/lib/format";
import { CATEGORY_ICON_KEYS, CATEGORY_ICON_LABELS, getCategoryIconKey } from "@/lib/category-icons";
import type { ContextMenuItem } from "@/app/(app)/context-menu";
import { CategoryIconGlyph } from "@/app/(app)/category-icon";
import { MenuGlyph } from "@/app/(app)/transaction-menu";
import { useToast } from "@/app/(app)/toast";

// The right-click menu for a budget category — shared by the Overview's
// Budget card and the Spending breakdown's category tables, so a category
// offers the same options wherever it's listed. Each surface supplies how
// it opens details and how "Set budget" works there (an inline amount
// field on the Overview, the category panel on Spending).

type MenuCategory = {
  id: string;
  name: string;
  icon: string | null;
  planned: number;
  actual: number;
};

export function useCategoryQuickActions() {
  const router = useRouter();
  const showToast = useToast();

  const clearBudget = useCallback(
    async (c: MenuCategory, periodId: string) => {
      const result = await deleteBudgetLine(c.id, periodId);
      showToast(result.ok ? `${c.name} budget cleared` : `Couldn't clear budget${result.error ? `: ${result.error}` : ""}`);
    },
    [showToast],
  );

  const setIcon = useCallback(
    async (c: MenuCategory, icon: string) => {
      const result = await updateCategoryIcon(c.id, icon);
      showToast(result.ok ? `${c.name} icon updated` : `Couldn't update icon${result.error ? `: ${result.error}` : ""}`);
    },
    [showToast],
  );

  const deactivate = useCallback(
    async (c: MenuCategory) => {
      const result = await updateCategoryActive(c.id, false);
      showToast(
        result.ok
          ? `${c.name} deactivated — reactivate it from the budget editor`
          : `Couldn't deactivate${result.error ? `: ${result.error}` : ""}`,
      );
    },
    [showToast],
  );

  const copySpent = useCallback(
    async (c: MenuCategory) => {
      try {
        await navigator.clipboard.writeText(c.actual.toFixed(2));
        showToast("Amount copied");
      } catch {
        showToast("Couldn't copy amount");
      }
    },
    [showToast],
  );

  return { router, clearBudget, setIcon, deactivate, copySpent };
}

export function categoryMenuItems(
  c: MenuCategory,
  opts: {
    periodId: string | null;
    onOpen: () => void;
    onSetBudget: () => void;
    actions: ReturnType<typeof useCategoryQuickActions>;
  },
): ContextMenuItem[] {
  const { periodId, onOpen, onSetBudget, actions } = opts;
  const currentIcon = getCategoryIconKey(c.name, c.icon);
  const transactionsHref = periodId
    ? `/transactions?period=${periodId}&category=${c.id}`
    : `/transactions?category=${c.id}`;
  const editorHref = "/spending/budget";

  return [
    {
      label: "Open details",
      icon: <MenuGlyph d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Zm9.5 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />,
      onSelect: onOpen,
    },
    {
      label: "View transactions",
      icon: <MenuGlyph d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />,
      onSelect: () => actions.router.push(transactionsHref),
    },
    { type: "divider" },
    {
      label: c.planned > 0 ? "Change budget" : "Set budget",
      icon: <MenuGlyph d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z M13.5 6.5l3 3" />,
      hint: c.planned > 0 ? formatMoney(c.planned) : undefined,
      disabled: !periodId,
      onSelect: onSetBudget,
    },
    ...(c.planned > 0 && periodId
      ? [
          {
            label: "Clear budget",
            icon: <MenuGlyph d="M6 6l12 12M18 6L6 18" />,
            onSelect: () => actions.clearBudget(c, periodId),
          } as ContextMenuItem,
        ]
      : []),
    {
      label: "Change icon",
      icon: <CategoryIconGlyph iconKey={currentIcon} size={15} className="text-text-faint" />,
      submenu: CATEGORY_ICON_KEYS.map((key) => ({
        label: CATEGORY_ICON_LABELS[key],
        checked: key === currentIcon,
        icon: <CategoryIconGlyph iconKey={key} size={15} className="text-text-muted" />,
        onSelect: () => {
          if (key !== currentIcon) actions.setIcon(c, key);
        },
      })),
    },
    {
      label: "Open in budget editor",
      icon: <MenuGlyph d="M4 5h16M4 12h16M4 19h10" />,
      onSelect: () => actions.router.push(editorHref),
    },
    {
      label: "Copy spent amount",
      icon: <MenuGlyph d="M9 9h10v10H9zM5 15V5h10" />,
      hint: formatMoney(c.actual),
      onSelect: () => actions.copySpent(c),
    },
    { type: "divider" },
    {
      label: "Deactivate category",
      tone: "danger",
      icon: <MenuGlyph d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM5.6 5.6l12.8 12.8" />,
      onSelect: () => actions.deactivate(c),
    },
  ];
}
