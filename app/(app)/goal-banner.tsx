import Link from "next/link";
import { formatMoney } from "@/lib/format";
import type { AccountWithBalance } from "@/lib/queries";
import type { Objective } from "@/lib/types";

// Full-width CTA at the bottom of the dashboard — surfaces whichever open
// goal is soonest due (or just-in-progress, if none has a deadline) so the
// dashboard nudges toward the Goals page instead of only ever pointing away
// from it via the sidebar link.
export function GoalBanner({
  objectives,
  accounts,
}: {
  objectives: Objective[];
  accounts: AccountWithBalance[];
}) {
  const open = objectives.filter((o) => o.status !== "Achieved");
  const featured = [...open].sort((a, b) => {
    const aTime = a.end_date ? new Date(a.end_date).getTime() : Infinity;
    const bTime = b.end_date ? new Date(b.end_date).getTime() : Infinity;
    return aTime - bTime;
  })[0];

  const linkedAccount = featured?.linked_account_id
    ? accounts.find((a) => a.id === featured.linked_account_id)
    : undefined;
  const accountPct =
    linkedAccount && linkedAccount.goal && linkedAccount.goal > 0
      ? Math.min(
          100,
          Math.max(0, (linkedAccount.balance / linkedAccount.goal) * 100),
        )
      : null;

  return (
    <div
      className="flex flex-col gap-6 overflow-hidden rounded-xl p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8"
      style={{
        background:
          "linear-gradient(135deg, var(--hero-bg) 0%, var(--accent) 100%)",
      }}
    >
      <div>
        <h2 className="text-xl font-bold text-hero-text sm:text-2xl">
          Plan today, secure tomorrow
        </h2>
        <p className="mt-1 max-w-sm text-sm text-hero-text-muted">
          Create goals and let BaileyBudget help you achieve them.
        </p>
        <Link
          href="/goals"
          className="mt-4 inline-flex items-center rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-hero-bg hover:bg-white/90"
        >
          Create a Goal
        </Link>
      </div>

      {featured && (
        <div className="flex items-center gap-4 sm:w-[280px] sm:shrink-0">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-hero-bg-2 text-2xl">
            🎯
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-hero-text-muted">Upcoming Goal</p>
            <p className="truncate text-sm font-semibold text-hero-text">
              {featured.name}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 min-w-0 flex-1 rounded-full bg-hero-bg-2">
                <div
                  className="h-1.5 rounded-full bg-accent-bright"
                  style={{ width: `${accountPct ?? 0}%` }}
                />
              </div>
              <span className="tabular shrink-0 text-xs text-hero-text-muted">
                {accountPct !== null ? `${Math.round(accountPct)}%` : "—"}
              </span>
            </div>
            {accountPct !== null && linkedAccount?.goal != null && (
              <p className="tabular mt-1 text-xs text-hero-text-muted">
                {formatMoney(linkedAccount.balance)} /{" "}
                {formatMoney(linkedAccount.goal)}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
