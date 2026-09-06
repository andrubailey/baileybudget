"use client";

import { useEffect, useState } from "react";
import { getQuickAddContext } from "@/app/actions";
import { QuickAddButton } from "./quick-add";
import { QuickAddTransferButton } from "./quick-add-transfer";
import type { Account, Category } from "@/lib/types";

type Context = { periodId: string | null; accounts: Account[]; categories: Category[] };

// Mobile counterpart to the dashboard's "Add income / Add expense / Add
// transfer" cards — those only exist on the dashboard page, but logging a
// transaction is the single most frequent action, so it needs to be
// reachable from anywhere on a phone. Sits just above the assistant chat
// bubble, same floating-button visual language.
export function MobileQuickActions() {
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState<Context | null>(null);

  useEffect(() => {
    getQuickAddContext().then(setContext);
  }, []);

  if (!context || !context.periodId) return null;
  const { periodId, accounts, categories } = context;

  return (
    <div className="fixed right-4 bottom-24 z-40 flex flex-col items-end gap-2 sm:right-5 sm:bottom-28 lg:hidden">
      {open && (
        <>
          <QuickAddTransferButton
            periodId={periodId}
            accounts={accounts}
            renderTrigger={(openModal) => (
              <ActionButton
                label="Transfer"
                bg="#e0f2fe"
                iconColor="#0ba5ec"
                onClick={openModal}
                icon={
                  <path
                    d="M7 7h11l-3-3M17 17H6l3 3"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                }
              />
            )}
          />
          <QuickAddButton
            kind="expense"
            periodId={periodId}
            accounts={accounts}
            categories={categories}
            renderTrigger={(openModal) => (
              <ActionButton
                label="Expense"
                bg="#fee4e2"
                iconColor="#f04438"
                onClick={openModal}
                icon={<path d="M5 12h14" strokeWidth={2} strokeLinecap="round" />}
              />
            )}
          />
          <QuickAddButton
            kind="income"
            periodId={periodId}
            accounts={accounts}
            categories={categories}
            renderTrigger={(openModal) => (
              <ActionButton
                label="Income"
                bg="#dcfae6"
                iconColor="#17b26a"
                onClick={openModal}
                icon={<path d="M12 5v14M5 12h14" strokeWidth={2} strokeLinecap="round" />}
              />
            )}
          />
        </>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close quick add menu" : "Open quick add menu"}
        aria-expanded={open}
        className="flex size-12 items-center justify-center rounded-full bg-accent text-white shadow-lg transition-transform hover:scale-105"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          className={`transition-transform duration-150 ${open ? "rotate-45" : ""}`}
        >
          <path d="M12 5v14M5 12h14" stroke="white" strokeWidth={2} strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

function ActionButton({
  label,
  bg,
  iconColor,
  icon,
  onClick,
}: {
  label: string;
  bg: string;
  iconColor: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2.5 rounded-full bg-surface py-1.5 pr-4 pl-1.5 shadow-lg"
    >
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: bg }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={iconColor}>
          {icon}
        </svg>
      </span>
      <span className="text-sm font-medium text-text">{label}</span>
    </button>
  );
}
