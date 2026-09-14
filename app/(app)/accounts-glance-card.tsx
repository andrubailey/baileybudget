"use client";

import Link from "next/link";
import { useState } from "react";
import type { AccountWithBalance } from "@/lib/queries";
import { formatMoney, isOwed } from "@/lib/format";
import { BankLogo } from "@/app/(app)/accounts/bank-logo";
import { EmptyState } from "@/app/(app)/empty-state";
import { useContextMenu } from "@/app/(app)/context-menu";
import {
  accountLoginUrl,
  accountMenuItems,
  useAccountQuickActions,
} from "@/app/(app)/accounts/account-menu";
import { AccountDetailPanel } from "@/app/(app)/account-detail-panel";
import { groupAccounts } from "@/app/(app)/accounts/account-groups";

// Grouped by Personal vs. Business, with debt accounts pulled into their own
// group regardless of which side they're on — "here's what you have" vs.
// "here's what you owe" is the mental split that actually matters when
// working through every account one by one, and a subtotal per group is real
// information the flat list never surfaced. One quiet line per account
// (name + balance) instead of a stacked mini-card, so the list stays a fast
// checklist rather than a scroll of repeated bars and big numbers. Shared by
// the dashboard's sidebar rail and the mobile Balances tab — the mobile
// overhaul reuses this exact minimal view as its own full-page destination
// instead of the full account-management page.
export function AccountsGlanceCard({ accounts }: { accounts: AccountWithBalance[] }) {
  // Right-click a row for the same account menu as the Accounts page, minus
  // editing/deactivating (no edit panel here) plus a link to that page.
  // A plain click instead opens a read-only detail panel — everything a
  // card can't fit (progress, recent activity) without leaving the page.
  const contextMenu = useContextMenu();
  const accountActions = useAccountQuickActions();
  const [detailAccount, setDetailAccount] = useState<AccountWithBalance | null>(null);

  if (accounts.length === 0) {
    return (
      <div className="card">
        <p className="text-heading mb-4 text-text">Accounts</p>
        <EmptyState
          compact
          icon="wallet"
          message="No accounts yet."
          action={
            <Link href="/accounts" className="text-xs font-medium text-accent underline underline-offset-2">
              Add your first account
            </Link>
          }
        />
      </div>
    );
  }

  // Business, Personal, then Debt — same grouping as the mobile Accounts tab.
  const groups = groupAccounts(accounts);

  return (
    <div className="card">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-heading text-text">Accounts</p>
        <Link
          href="/accounts"
          className="text-xs font-medium text-text-faint transition-colors hover:text-text"
        >
          View All
        </Link>
      </div>
      <div className="space-y-6">
        {(() => {
          let rowIndex = 0;
          return groups.map((group) => (
            <div key={group.key}>
              <p className="text-section-label mb-2.5">
                {group.label}
              </p>
              {/* No divide-y here on purpose — each row already gets its own
                  rounded hover/press background (inset via -mx-3/px-3
                  below), and a hairline divider drawn across that rounded
                  shape read as a broken corner rather than a clean pill. The
                  rows' own py-3 padding is enough separation without one —
                  and every row keeps that same py-3 on both edges (no
                  first:/last: reset), so a group with only one account
                  doesn't end up with both resets firing at once and
                  collapsing that row's box to a different size than
                  everyone else's. */}
              <div>
                {group.accounts.map((a) => {
                  const i = rowIndex++;
                  return (
                    <div
                      key={a.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setDetailAccount(a)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setDetailAccount(a);
                        }
                      }}
                      onContextMenu={(e) =>
                        contextMenu.open(
                          e,
                          accountMenuItems(a, {
                            allTransactionsHref: `/transactions?account=${a.id}&period=all`,
                            loginUrl: accountLoginUrl(a),
                            manageHref: "/accounts",
                            actions: accountActions,
                          }),
                        )
                      }
                      style={{ animationDelay: `${i * 12}ms` }}
                      className="animate-fade-in-up -mx-3 flex cursor-pointer items-center gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-bg"
                    >
                      {a.logo_url ? (
                        <span className="inline-flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-white">
                          {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded storage URL, not a local/known-domain asset */}
                          <img
                            src={a.logo_url}
                            alt=""
                            className="size-full object-cover"
                          />
                        </span>
                      ) : a.bank ? (
                        <BankLogo bank={a.bank} size="sm" />
                      ) : (
                        <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-bg text-text-muted">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                            <path
                              d="M3 10h18M6 6h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z"
                              stroke="currentColor"
                              strokeWidth={1.6}
                              strokeLinejoin="round"
                            />
                          </svg>
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm text-text-muted">
                        {a.name}
                      </span>
                      <span
                        className={`tabular shrink-0 text-sm font-semibold ${
                          a.is_debt && isOwed(a.balance) ? "text-negative" : "text-text"
                        }`}
                      >
                        {/* Owed money reads red and negative; a paid-off
                            card is just a plain $0.00. */}
                        {a.is_debt && isOwed(a.balance) ? "-" : ""}
                        {formatMoney(a.balance)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ));
        })()}
      </div>
      {contextMenu.menu}
      {detailAccount && (
        <AccountDetailPanel
          key={detailAccount.id}
          account={detailAccount}
          accounts={accounts}
          onClose={() => setDetailAccount(null)}
        />
      )}
    </div>
  );
}
