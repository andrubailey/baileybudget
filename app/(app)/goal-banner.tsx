import Link from "next/link";
import { formatMoney } from "@/lib/format";
import { timeElapsedPct } from "@/lib/objective-progress";
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
  // Same fallback the Goals page list uses: without a linked account/goal to
  // measure against, progress is how far through the goal's date range
  // today falls, rather than just showing a bare dash.
  const pct =
    accountPct ?? timeElapsedPct(featured?.start_date ?? null, featured?.end_date ?? null);

  return (
    <div
      className="relative flex flex-col gap-6 overflow-hidden rounded-xl bg-cover bg-center p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8"
      style={{
        background: featured?.image_url
          ? `url(${featured.image_url})`
          : "linear-gradient(135deg, var(--hero-bg) 0%, var(--accent) 100%)",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      {/* Darken the featured goal's photo just enough that white text stays
          legible over it — the plain gradient fallback already has enough
          contrast on its own and doesn't need this. */}
      {featured?.image_url && <div className="absolute inset-0 bg-black/45" />}

      <div className="relative">
        <h2 className="text-xl font-bold text-hero-text sm:text-2xl">
          Goals
        </h2>
        <p className="mt-1 max-w-sm text-sm text-hero-text-muted">
          Set a goal and track your progress toward it.
        </p>
        <Link
          href="/goals"
          className="mt-4 inline-flex items-center rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-hero-bg hover:bg-white/90"
        >
          Create a goal
        </Link>
      </div>

      {featured && (
        <div className="relative flex items-center gap-4 sm:w-[280px] sm:shrink-0">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-white/15 text-2xl backdrop-blur-sm">
            🎯
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-hero-text-muted">Upcoming goal</p>
            <p className="truncate text-sm font-semibold text-hero-text">
              {featured.name}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 min-w-0 flex-1 rounded-full bg-white/25">
                <div
                  className="animate-bar-grow-x h-1.5 rounded-full bg-white"
                  style={{ width: `${pct ?? 0}%` }}
                />
              </div>
              <span className="tabular shrink-0 text-xs text-hero-text-muted">
                {pct !== null ? `${Math.round(pct)}%` : "—"}
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
