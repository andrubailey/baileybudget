import Link from "next/link";
import { formatDate, formatMoney } from "@/lib/format";
import { timeElapsedPct } from "@/lib/objective-progress";
import type { AccountWithBalance } from "@/lib/queries";
import type { Objective } from "@/lib/types";
import { SegmentedProgress } from "@/app/(app)/segmented-progress";

// Goals card in the dashboard's right rail, under the Accounts card —
// surfaces whichever open goal is soonest due (or just-in-progress, if none
// has a deadline) so the dashboard nudges toward the Goals page instead of
// only ever pointing away from it via the sidebar link. The rail is only
// 260px wide, so everything reads top to bottom: header, the goal's name,
// then a big percentage with the bar under it.
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
      className="relative flex flex-col overflow-hidden rounded-xl p-6"
      style={{
        background: featured?.image_url
          ? `url(${featured.image_url})`
          : "linear-gradient(160deg, var(--hero-bg) 0%, var(--accent) 100%)",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      {/* Darkening layer so the white text stays readable — heavier over a
          goal's photo (which can be any brightness), lighter over the plain
          gradient, whose accent-green end was still too bright on its own. */}
      <div
        className={`absolute inset-0 ${featured?.image_url ? "bg-black/60" : "bg-black/35"}`}
      />

      <div className="relative flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-heading text-hero-text">
          <span aria-hidden="true">🎯</span>
          Goals
        </h2>
        <Link
          href="/goals"
          className="text-xs font-medium text-hero-text-muted transition-colors hover:text-hero-text"
        >
          View All
        </Link>
      </div>

      {featured ? (
        <div className="relative mt-5">
          <p className="text-[11px] font-semibold tracking-wide text-hero-text-muted uppercase">
            Upcoming goal
          </p>
          <p className="mt-1 line-clamp-2 text-lg leading-snug font-semibold text-hero-text">
            {featured.name}
          </p>

          <div className="mt-4 flex items-baseline justify-between gap-2">
            <span className="tabular text-3xl font-bold text-hero-text">
              {pct !== null ? `${Math.round(pct)}%` : "—"}
            </span>
            {featured.end_date && (
              <span className="shrink-0 text-xs text-hero-text-muted">
                Due {formatDate(featured.end_date)}
              </span>
            )}
          </div>
          <SegmentedProgress
            pct={pct ?? 0}
            overBudget={false}
            color="white"
            trackColor="rgba(255,255,255,0.25)"
            className="mt-2"
          />
          {accountPct !== null && linkedAccount?.goal != null && (
            <p className="tabular mt-2 text-xs text-hero-text-muted">
              {formatMoney(linkedAccount.balance)} of {formatMoney(linkedAccount.goal)}
            </p>
          )}
        </div>
      ) : (
        <p className="relative mt-2 text-sm text-hero-text-muted">
          Set a goal and track your progress toward it.
        </p>
      )}
    </div>
  );
}
