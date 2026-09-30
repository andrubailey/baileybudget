import { PageHeader, SectionHeader } from "@/components/ui";
import { getAccountsWithBalances } from "@/lib/queries";
import { EmptyState } from "@/app/(app)/empty-state";
import { AccountReconcileRow } from "./account-reconcile-row";
import { groupByInstitution, isStale, STALE_AFTER_DAYS } from "./institution-groups";

// The mobile Accounts screen, grouped by institution — the order you actually
// reconcile in, one bank app at a time. Every row carries how long ago its
// balance was last confirmed, because a stale balance here is worse than no
// balance: it reads as fact while being quietly wrong.
export default async function BalancesPage() {
  const accounts = await getAccountsWithBalances();
  const activeAccounts = accounts.filter((a) => a.is_active);

  if (activeAccounts.length === 0) {
    return (
      <>
        <PageHeader title="Accounts" />
        <EmptyState compact icon="wallet" message="No accounts yet." />
      </>
    );
  }

  const groups = groupByInstitution(activeAccounts);
  const staleCount = activeAccounts.filter((a) =>
    isStale(a.balance_checked_at),
  ).length;

  return (
    <>
      <PageHeader
        title="Accounts"
        subtitle={
          staleCount > 0
            ? `${staleCount} ${staleCount === 1 ? "balance" : "balances"} unchecked for ${STALE_AFTER_DAYS}+ days`
            : "All balances recently confirmed"
        }
      />
      {groups.map((group) => (
        <section key={group.key}>
          <SectionHeader
            title={
              <span className="flex items-center gap-(--space-2)">
                {group.label}
                {/* Quiet: a dot, not a warning. It marks where to look next,
                    it isn't an error. */}
                {group.hasStale && (
                  <span
                    role="img"
                    aria-label={`Not checked in ${STALE_AFTER_DAYS} days`}
                    title={`Not checked in ${STALE_AFTER_DAYS} days`}
                    className="size-(--space-2) shrink-0 rounded-(--radius-pill) bg-(--accent-caution)"
                  />
                )}
              </span>
            }
          />
          <div>
            {group.accounts.map((a) => (
              <AccountReconcileRow key={a.id} account={a} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
