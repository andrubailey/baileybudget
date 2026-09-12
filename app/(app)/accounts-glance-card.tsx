"use client";

import Link from "next/link";
import type { AccountWithBalance } from "@/lib/queries";
import { formatMoney } from "@/lib/format";
import { BankLogo } from "@/app/(app)/accounts/bank-logo";
import { EmptyState } from "@/app/(app)/empty-state";
import { useContextMenu } from "@/app/(app)/context-menu";
import {
  accountLoginUrl,
  accountMenuItems,
  useAccountQuickActions,
} from "@/app/(app)/accounts/account-menu";

// Preferred display order for the Personal group — checking first as the
// day-to-day account, then the two savings goals in the order they matter
// most. Anything not in this list (a new personal account added later)
// just falls after these, alphabetically.
const PERSONAL_ACCOUNT_ORDER = ["Personal Checking", "Car Maintenance Fund", "Emergency Fund"];

function byPersonalOrder(a: AccountWithBalance, b: AccountWithBalance) {
  const ai = PERSONAL_ACCOUNT_ORDER.indexOf(a.name);
  const bi = PERSONAL_ACCOUNT_ORDER.indexOf(b.name);
  if (ai !== -1 && bi !== -1) return ai - bi;
  if (ai !== -1) return -1;
  if (bi !== -1) return 1;
  return a.name.localeCompare(b.name);
}

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
  const contextMenu = useContextMenu();
  const accountActions = useAccountQuickActions();

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

  const debt = accounts.filter((a) => a.is_debt);
  const groups: {
    key: string;
    label: string;
    accounts: AccountWithBalance[];
  }[] = [
    {
      key: "business",
      label: "Business",
      accounts: accounts
        .filter((a) => !a.is_debt && a.is_business)
        .sort((a, b) => a.name.localeCompare(b.name)),
    },
    {
      key: "personal",
      label: "Personal",
      accounts: accounts.filter((a) => !a.is_debt && !a.is_business).sort(byPersonalOrder),
    },
  ].filter((g) => g.accounts.length > 0);

  if (debt.length > 0) {
    groups.push({
      key: "debt",
      label: "Debt",
      accounts: debt.slice().sort((a, b) => a.name.localeCompare(b.name)),
    });
  }

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
              <div className="divide-y divide-border">
                {group.accounts.map((a) => {
                  const i = rowIndex++;
                  return (
                    <div
                      key={a.id}
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
                      className="animate-fade-in-up flex items-center gap-3 py-3 first:pt-0 last:pb-0"
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
                          a.is_debt && a.balance > 0 ? "text-negative" : "text-text"
                        }`}
                      >
                        {/* Owed money reads red and negative; a paid-off
                            card is just a plain $0.00. */}
                        {a.is_debt && a.balance > 0 ? "-" : ""}
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
    </div>
  );
}
