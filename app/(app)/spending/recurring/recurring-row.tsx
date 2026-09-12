"use client";

import { useTransition } from "react";
import { toggleRecurringActive } from "@/app/actions";
import { formatMoney } from "@/lib/format";
import type { AccountLookup } from "@/lib/transaction-presentation";
import { TransactionAvatar } from "@/app/(app)/transaction-row";
import { CategoryChip } from "@/app/(app)/category-chip";
import { ToggleSwitch } from "@/app/(app)/toggle-switch";
import type { RecurringTransaction } from "@/lib/types";

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

export function RecurringRow({
  rule,
  account,
  category,
  postedThisPeriod,
  onClick,
  onContextMenu,
}: {
  rule: RecurringTransaction;
  account: AccountLookup | null;
  category: { id: string; name: string; icon?: string | null } | null;
  postedThisPeriod: boolean;
  onClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      onContextMenu={onContextMenu}
      className={`flex items-center gap-3 rounded-lg px-3 py-3 transition-opacity ${
        onClick ? "cursor-pointer hover:bg-bg" : ""
      } ${rule.is_active ? "" : "opacity-50"}`}
    >
      <TransactionAvatar label={rule.description} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text">{rule.description}</p>
        <p className="text-metadata flex min-w-0 items-center gap-1.5 truncate">
          <span className="shrink-0">Bills on the {ordinal(rule.day_of_month)}</span>
          {account && (
            <>
              <span aria-hidden="true">·</span>
              <span className="min-w-0 truncate">{account.name}</span>
            </>
          )}
          {category && (
            <>
              <span aria-hidden="true">·</span>
              <CategoryChip
                id={category.id}
                name={category.name}
                icon={category.icon}
                size="xs"
                showName={false}
              />
              <span className="min-w-0 truncate">{category.name}</span>
            </>
          )}
        </p>
      </div>

      {rule.is_active && (
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap ${
            postedThisPeriod
              ? "bg-positive-bg text-positive-strong"
              : "bg-caution-bg text-caution-strong"
          }`}
        >
          {postedThisPeriod ? "Posted" : "Upcoming"}
        </span>
      )}

      <span
        className={`text-amount shrink-0 ${rule.kind === "income" ? "text-positive" : "text-text"}`}
      >
        {rule.kind === "income" ? "+" : "-"}
        {formatMoney(rule.amount)}
      </span>

      <span onClick={(e) => e.stopPropagation()}>
        <ToggleSwitch
          checked={rule.is_active}
          onChange={() =>
            startTransition(async () => {
              await toggleRecurringActive(rule.id, !rule.is_active);
            })
          }
          disabled={isPending}
          label={rule.is_active ? "Pause recurring bill" : "Resume recurring bill"}
        />
      </span>
    </div>
  );
}
