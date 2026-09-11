import Link from "next/link";
import type { Period } from "@/lib/types";

// Month switching as a horizontally-scrolling row of pills instead of a
// dropdown — the whole point on a phone is that the last several months are
// one thumb-swipe away, not two taps into a menu. Oldest to newest, left to
// right, so it reads like a timeline ending at "now."
export function MonthPills({
  periods,
  activeId,
  tab,
}: {
  periods: Period[];
  activeId: string;
  tab: string;
}) {
  const recent = periods.slice(0, 12).slice().reverse();

  return (
    <div className="snap-row -mx-4 px-4 sm:mx-0 sm:px-0" style={{ scrollSnapType: "none" }}>
      {recent.map((p) => {
        const active = p.id === activeId;
        return (
          <Link
            key={p.id}
            href={`/budget?period=${p.id}&tab=${tab}`}
            scroll={false}
            aria-current={active ? "true" : undefined}
            className={`!flex-none rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
              active
                ? "bg-text text-surface"
                : "bg-surface text-text-muted shadow-card"
            }`}
          >
            {p.name.split(" ")[0].slice(0, 3)}
          </Link>
        );
      })}
    </div>
  );
}
