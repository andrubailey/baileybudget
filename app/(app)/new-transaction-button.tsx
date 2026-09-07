"use client";

import { useEffect, useRef, useState } from "react";
import { getQuickAddContext } from "@/app/actions";
import { QuickAddButton } from "./quick-add";
import { QuickAddTransferButton } from "./quick-add-transfer";
import type { Account, Category } from "@/lib/types";

type Context = { periodId: string | null; accounts: Account[]; categories: Category[] };

const OPTIONS = [
  {
    key: "expense" as const,
    label: "Expense",
    icon: <path d="M5 12h14" strokeWidth={2} strokeLinecap="round" />,
    color: "#f04438",
  },
  {
    key: "income" as const,
    label: "Income",
    icon: <path d="M12 5v14M5 12h14" strokeWidth={2} strokeLinecap="round" />,
    color: "#17b26a",
  },
  {
    key: "transfer" as const,
    label: "Transfer",
    icon: (
      <path
        d="M7 7h11l-3-3M17 17H6l3 3"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
    color: "#0ba5ec",
  },
];

// A single accent-colored entry point for logging a transaction, replacing
// the dashboard's row of separate "Add income / Add expense / Add transfer"
// cards — reachable from the sidebar on every page instead of only the
// dashboard. Reuses the existing quick-add forms via renderTrigger rather
// than rebuilding them, so duplicate-detection, splits, etc. all still work.
export function NewTransactionButton({
  collapsed,
  variant = "full",
  menuAlign = "left",
  menuPosition = "below",
}: {
  collapsed?: boolean;
  // "icon" is a compact circular trigger for tight spaces (the mobile top
  // bar) instead of the full-width labeled button used in the sidebar.
  variant?: "full" | "icon";
  menuAlign?: "left" | "right";
  // "above" for triggers anchored to the bottom of the screen, so the
  // picker doesn't try to open off the bottom edge of the viewport.
  menuPosition?: "above" | "below";
}) {
  const [context, setContext] = useState<Context | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const openers = useRef<Record<"expense" | "income" | "transfer", () => void>>({
    expense: () => {},
    income: () => {},
    transfer: () => {},
  });

  useEffect(() => {
    getQuickAddContext().then(setContext);
  }, []);

  if (!context || !context.periodId) return null;
  const { periodId, accounts, categories } = context;

  return (
    <div className="relative">
      {variant === "icon" ? (
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          aria-label="New transaction"
          className="flex size-11 items-center justify-center rounded-lg bg-accent text-white transition-opacity hover:opacity-90"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
          </svg>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          title={collapsed ? "New transaction" : undefined}
          className={`flex w-full items-center gap-3 rounded-lg bg-accent px-3 py-2.5 text-[15px] font-semibold text-white transition-opacity hover:opacity-90 ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="shrink-0">
            <path
              d="M12 5v14M5 12h14"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
            />
          </svg>
          {!collapsed && <span className="truncate">New transaction</span>}
        </button>
      )}

      {pickerOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setPickerOpen(false)} />
          <div
            className={`absolute z-50 w-48 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-modal ${
              menuAlign === "right" ? "right-0" : "left-0"
            } ${menuPosition === "above" ? "bottom-full mb-2" : "top-full mt-2"}`}
          >
            {OPTIONS.map((o) => (
              <button
                key={o.key}
                type="button"
                onClick={() => {
                  setPickerOpen(false);
                  openers.current[o.key]();
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm font-medium text-text hover:bg-bg"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={o.color}>
                  {o.icon}
                </svg>
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Invisible — these just hold the real forms/modals open for reuse. */}
      <QuickAddButton
        kind="expense"
        periodId={periodId}
        accounts={accounts}
        categories={categories}
        renderTrigger={(open) => {
          openers.current.expense = open;
          return null;
        }}
      />
      <QuickAddButton
        kind="income"
        periodId={periodId}
        accounts={accounts}
        categories={categories}
        renderTrigger={(open) => {
          openers.current.income = open;
          return null;
        }}
      />
      <QuickAddTransferButton
        periodId={periodId}
        accounts={accounts}
        renderTrigger={(open) => {
          openers.current.transfer = open;
          return null;
        }}
      />
    </div>
  );
}
