"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { fetchAccountTransactions } from "@/app/(app)/account-detail-actions";
import { accountLoginUrl } from "@/app/(app)/accounts/account-menu";
import { BankLogo } from "@/app/(app)/accounts/bank-logo";
import { Money } from "@/app/(app)/money";
import { ReconcileModal } from "@/app/(app)/accounts/reconcile-modal";
import { SegmentedProgress } from "@/app/(app)/segmented-progress";
import { formatDate, isOwed } from "@/lib/format";
import {
  presentTransaction,
  toAccountLookup,
  accountLabelFor,
} from "@/lib/transaction-presentation";
import type { AccountWithBalance } from "@/lib/queries";
import type { Transaction } from "@/lib/types";

const CLOSE_MS = 160;

function accountTransactionsHref(accountId: string) {
  return `/transactions?account=${accountId}&period=all`;
}

// Slide-over detail for one account, opened from a click anywhere it's
// listed (the dashboard's Accounts card, the mobile Balances screen) —
// balance, goal/payoff progress, the facts a card can't fit, and its recent
// activity, without leaving for the full Accounts page. Read-only: editing
// still lives there, reached via the footer link. Portaled to <body> for
// the same reason CategoryDetailPanel is — a transformed ancestor row would
// clip this fixed overlay to itself.
export function AccountDetailPanel({
  account: a,
  accounts,
  onClose,
}: {
  account: AccountWithBalance;
  // Needed to label a transfer's counterparty account in the recent-
  // activity list (e.g. "Checking → Emergency Fund").
  accounts: AccountWithBalance[];
  onClose: () => void;
}) {
  const [closing, setClosing] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [reconciling, setReconciling] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchAccountTransactions(a.id)
      .then((rows) => {
        if (!cancelled) setTransactions(rows);
      })
      .catch(() => {
        if (!cancelled) setTransactions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [a.id]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setClosing(true);
      setTimeout(onClose, CLOSE_MS);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function close() {
    setClosing(true);
    setTimeout(onClose, CLOSE_MS);
  }

  const owed = a.is_debt && isOwed(a.balance);
  const goalProgress =
    !a.is_debt && a.goal && a.goal > 0
      ? Math.min(100, Math.max(0, (a.balance / a.goal) * 100))
      : null;
  const payoffSpan = a.starting_balance - (a.goal ?? 0);
  const payoffProgress =
    a.is_debt && payoffSpan !== 0
      ? Math.min(100, Math.max(0, ((a.starting_balance - a.balance) / payoffSpan) * 100))
      : null;
  const loginUrl = accountLoginUrl(a);
  const accountsById = toAccountLookup(accounts);

  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`${a.name} details`}>
      <div
        className={`absolute inset-0 bg-black/40 ${
          closing ? "animate-modal-backdrop-out" : "animate-modal-backdrop"
        }`}
        onClick={close}
      />
      <aside
        className={`absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-surface shadow-modal ${
          closing ? "animate-drawer-out" : "animate-drawer-in"
        }`}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
          <p className="card-label text-text-muted">Account detail</p>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="-mr-2 flex size-9 items-center justify-center rounded-lg text-text-faint transition-colors hover:bg-bg hover:text-text"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* A full-height drawer, so its own scroll ends at the true bottom
            edge — pb-[...] instead of the flat p-5 bottom so the last
            section clears the home indicator, not just the visual edge. */}
        <div
          className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5"
          style={{ paddingBottom: "var(--safe-bottom)" }}
        >
          <section className="rounded-xl border border-border p-4">
            <div className="flex items-center gap-2.5">
              {a.bank && <BankLogo bank={a.bank} size="sm" />}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-text">{a.name}</p>
                <p className="text-xs text-text-faint">
                  {[a.account_type, a.bank].filter(Boolean).join(" · ") || "Account"}
                </p>
              </div>
            </div>

            <p className="mt-3 flex items-baseline gap-1.5">
              <Money
                amount={a.balance}
                variant="balance"
                signDisplay={owed ? "-" : "none"}
                className={`text-balance-sm ${owed ? "text-negative" : "text-text"}`}
              />
              {a.is_debt && (
                <span className="text-sm font-normal text-text-faint">{owed ? "owed" : "paid off"}</span>
              )}
            </p>

            {goalProgress !== null && (
              <>
                <p className="mt-3 text-sm text-text-muted">
                  <Money amount={a.balance} /> of <Money amount={a.goal!} /> goal
                </p>
                <SegmentedProgress pct={goalProgress} overBudget={false} className="mt-1.5" />
              </>
            )}
            {payoffProgress !== null && (
              <>
                <p className="mt-3 text-sm text-text-muted">
                  <Money amount={a.starting_balance - a.balance} /> paid of{" "}
                  <Money amount={a.starting_balance} />
                </p>
                <SegmentedProgress pct={payoffProgress} overBudget={false} className="mt-1.5" />
              </>
            )}

            {loginUrl && (
              <a
                href={loginUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
              >
                Log in to {a.bank ?? "bank"} ↗
              </a>
            )}
          </section>

          <section className="grid grid-cols-2 divide-x divide-border rounded-xl border border-border">
            <button
              type="button"
              onClick={() => setReconciling(true)}
              className="flex flex-col items-start p-4 text-left transition-colors hover:bg-bg"
            >
              <p className="text-xs text-text-muted">Balance check</p>
              <p className="mt-1 text-base font-semibold text-accent">Reconcile</p>
            </button>
            <div className="p-4">
              <p className="text-xs text-text-muted">{a.is_business ? "Business" : "Personal"}</p>
              <p className="mt-1 text-base font-semibold text-text">{a.is_debt ? "Debt" : "Asset"}</p>
            </div>
          </section>

          <section className="rounded-xl border border-border p-4">
            <p className="card-label text-text-muted">Recent activity</p>
            {transactions === null ? (
              <p className="mt-3 text-sm text-text-faint">Loading…</p>
            ) : transactions.length === 0 ? (
              <p className="mt-3 text-sm text-text-faint">No transactions yet.</p>
            ) : (
              <ul className="mt-2 divide-y divide-border">
                {transactions.map((t) => {
                  const presentation = presentTransaction(t, accountsById);
                  const label = accountLabelFor(t, accountsById);
                  return (
                    <li key={t.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-text">{presentation.displayDescription}</p>
                        <p className="text-xs text-text-faint">
                          {formatDate(t.txn_date)}
                          {t.kind === "transfer" && label ? ` · ${label}` : ""}
                        </p>
                      </div>
                      <Money
                        amount={t.amount}
                        signDisplay={presentation.sign}
                        tone={presentation.tone}
                        className="tabular shrink-0 text-sm font-medium"
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <div className="shrink-0 border-t border-border p-4">
          <Link
            href={accountTransactionsHref(a.id)}
            className="flex w-full items-center justify-center rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-text transition-colors hover:bg-bg"
          >
            View all transactions
          </Link>
        </div>
      </aside>
      {reconciling && <ReconcileModal account={a} onClose={() => setReconciling(false)} />}
    </div>,
    document.body,
  );
}
