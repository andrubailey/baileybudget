"use client";

import { forwardRef } from "react";
import { formatDate } from "@/lib/format";
import { getLetterColors } from "@/lib/letter-colors";
import type { Transaction } from "@/lib/types";
import {
  accountLabelFor,
  presentTransaction,
  type AccountLookup,
  type TransactionPresentation,
} from "@/lib/transaction-presentation";
import { Money } from "@/app/(app)/money";
import { CategoryChip } from "@/app/(app)/category-chip";

// The one way a transaction is drawn as a list row. The dashboard's recent
// list, the transactions page's mobile cards, and ⌘K results all render
// this; the desktop table is a <table> so it composes the same pieces
// (avatar, badge, amount) cell by cell instead. Any change to how a
// transaction reads lands everywhere at once.

// Letter avatar — one color per first letter, so all the A's match.
export function TransactionAvatar({
  label,
  size = "md",
  className = "",
}: {
  label: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const colors = getLetterColors(label);
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${
        size === "sm" ? "size-7 text-xs" : "size-9 text-xs"
      } ${className}`}
      style={{ backgroundColor: colors.bg, color: colors.text }}
    >
      {label.trim()[0]?.toUpperCase() ?? "?"}
    </span>
  );
}

export function TransactionAmount({
  amount,
  presentation,
  className = "",
}: {
  amount: number;
  presentation: Pick<TransactionPresentation, "sign" | "tone">;
  className?: string;
}) {
  return (
    <Money
      amount={amount}
      signDisplay={presentation.sign}
      tone={presentation.tone}
      className={`text-amount shrink-0 ${className}`}
    />
  );
}

// Static markers a row can carry beside its description.
export function RowFlags({
  transaction: t,
  onApprove,
}: {
  transaction: Pick<Transaction, "recurring_transaction_id" | "pending_approval">;
  onApprove?: () => void;
}) {
  return (
    <>
      {t.recurring_transaction_id && (
        <span className="shrink-0 text-text-faint" title="Recurring" aria-label="Recurring">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      )}
      {t.pending_approval &&
        (onApprove ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onApprove();
            }}
            title="Needs approval — click to approve"
            className="shrink-0 rounded-full bg-caution-bg px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap text-caution-strong transition-colors hover:bg-caution-border"
          >
            Needs approval
          </button>
        ) : (
          <span className="shrink-0 rounded-full bg-caution-bg px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap text-caution-strong">
            Needs approval
          </span>
        ))}
    </>
  );
}

type RowProps = {
  transaction: Transaction;
  accountsById: ReadonlyMap<string, AccountLookup>;
  category?: { id: string; name: string; icon?: string | null } | null;
  // Optional replacement for the category slot (e.g. a "Split (3)" pill).
  categorySlot?: React.ReactNode;
  onClick?: () => void;
  // Right-click menu (see transaction-menu.tsx).
  onContextMenu?: (e: React.MouseEvent) => void;
  onApprove?: () => void;
  // Which secondary facts to show under the description. Defaults to all.
  meta?: { date?: boolean; account?: boolean; category?: boolean };
  index?: number;
  className?: string;
  // Rendered inside a swipe wrapper on mobile, which owns the card chrome.
  bare?: boolean;
  trailing?: React.ReactNode;
};

export const TransactionRow = forwardRef<HTMLButtonElement, RowProps>(function TransactionRow(
  {
    transaction: t,
    accountsById,
    category,
    categorySlot,
    onClick,
    onContextMenu,
    onApprove,
    meta,
    index = 0,
    className = "",
    bare = false,
    trailing,
  },
  ref,
) {
  const p = presentTransaction(t, accountsById);
  const showDate = meta?.date ?? true;
  const showAccount = meta?.account ?? true;
  const showCategory = meta?.category ?? true;
  const accountLabel = showAccount ? accountLabelFor(t, accountsById) : null;

  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      onContextMenu={onContextMenu}
      disabled={!onClick}
      style={{ animationDelay: `${index * 12}ms` }}
      className={`animate-fade-in-up flex w-full items-center gap-3 text-left transition-colors ${
        bare ? "" : "rounded-lg px-3 py-3 hover:bg-bg disabled:hover:bg-transparent"
      } ${className}`}
    >
      <TransactionAvatar label={p.displayDescription} />
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-medium text-text">{p.displayDescription}</span>
          <RowFlags transaction={t} onApprove={onApprove} />
        </p>
        <p className="text-metadata flex min-w-0 items-center gap-1.5 truncate">
          {showDate && <span className="shrink-0">{formatDate(t.txn_date)}</span>}
          {accountLabel && (
            <>
              {showDate && <span aria-hidden="true">·</span>}
              <span className="min-w-0 truncate">{accountLabel}</span>
            </>
          )}
          {showCategory && (categorySlot || category) && (
            <>
              <span aria-hidden="true">·</span>
              {categorySlot ?? (
                <span className="min-w-0 truncate">
                  <CategoryChip id={category!.id} name={category!.name} icon={category!.icon} size="xs" />
                </span>
              )}
            </>
          )}
        </p>
      </div>
      <TransactionAmount amount={t.amount} presentation={p} className="ml-2" />
      {trailing}
    </button>
  );
});
