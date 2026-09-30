"use client";

import { useState } from "react";
import { Row } from "@/components/ui";
import { formatMoney, formatRelativeTime, isOverdrawn, isOwed } from "@/lib/format";
import { BankLogo } from "@/app/(app)/accounts/bank-logo";
import { ReconcileModal } from "@/app/(app)/accounts/reconcile-modal";
import type { AccountWithBalance } from "@/lib/queries";
import { isStale } from "./institution-groups";

// One account: name, masked identifier, right-aligned balance, and how long
// ago that balance was last confirmed against the bank. The whole row is the
// reconcile target — the freshness stamp is only useful next to the one action
// that refreshes it.
export function AccountReconcileRow({
  account: a,
}: {
  account: AccountWithBalance;
}) {
  const [reconciling, setReconciling] = useState(false);
  const stale = isStale(a.balance_checked_at);
  const negative =
    (a.is_debt && isOwed(a.balance)) || (!a.is_debt && isOverdrawn(a.balance));

  return (
    <>
      <Row
        leading={
          a.logo_url ? (
            <span className="inline-flex size-(--space-6) items-center justify-center overflow-hidden rounded-(--radius-pill) bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded storage URL, not a local/known-domain asset */}
              <img src={a.logo_url} alt="" className="size-full object-cover" />
            </span>
          ) : a.bank ? (
            <BankLogo bank={a.bank} size="sm" />
          ) : undefined
        }
        title={a.name}
        subtitle={a.account_mask ? `•••• ${a.account_mask}` : "No last 4 saved"}
        value={
          <span className={negative ? "text-(--accent-caution)" : undefined}>
            {formatMoney(a.balance)}
          </span>
        }
        valueCaption={
          <span className={stale ? "text-(--accent-caution)" : undefined}>
            {a.balance_checked_at
              ? `confirmed ${formatRelativeTime(a.balance_checked_at)}`
              : "never confirmed"}
          </span>
        }
        onPress={() => setReconciling(true)}
      />
      {reconciling && (
        <ReconcileModal account={a} onClose={() => setReconciling(false)} />
      )}
    </>
  );
}
