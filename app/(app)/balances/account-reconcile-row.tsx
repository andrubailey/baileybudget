"use client";

import { useState } from "react";
import { isOverdrawn, isOwed } from "@/lib/format";
import { Money } from "@/app/(app)/money";
import { BankLogo } from "@/app/(app)/accounts/bank-logo";
import { ReconcileModal } from "@/app/(app)/accounts/reconcile-modal";
import type { AccountWithBalance } from "@/lib/queries";

// One account on the mobile Accounts tab: logo, name and balance, read-only.
// The only action is "Reconcile", which opens the same check-against-the-bank
// window as the desktop account cards (with "find the discrepancy"). Editing
// an account's balance directly isn't offered on mobile.
export function AccountReconcileRow({
  account: a,
  index = 0,
}: {
  account: AccountWithBalance;
  index?: number;
}) {
  const [reconciling, setReconciling] = useState(false);

  return (
    <>
      <div
        style={{ animationDelay: `${index * 12}ms` }}
        className="animate-fade-in-up flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          {a.logo_url ? (
            <span className="inline-flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded storage URL, not a local/known-domain asset */}
              <img src={a.logo_url} alt="" className="size-full object-cover" />
            </span>
          ) : a.bank ? (
            <BankLogo bank={a.bank} size="sm" />
          ) : null}
          <div className="min-w-0">
            <p className="truncate text-sm text-text">{a.name}</p>
            <button
              type="button"
              onClick={() => setReconciling(true)}
              aria-label={`Reconcile ${a.name}`}
              className="-my-1 py-1 text-xs font-medium text-text-muted transition-colors hover:text-accent hover:underline"
            >
              Reconcile
            </button>
          </div>
        </div>

        <Money
          amount={a.balance}
          signDisplay={!a.is_debt && isOverdrawn(a.balance) ? "-" : "none"}
          tone={(a.is_debt && isOwed(a.balance)) || (!a.is_debt && isOverdrawn(a.balance)) ? "negative" : undefined}
          className="tabular shrink-0 text-sm font-semibold text-text"
        />
      </div>
      {reconciling && <ReconcileModal account={a} onClose={() => setReconciling(false)} />}
    </>
  );
}
