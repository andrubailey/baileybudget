import { formatMoney } from "@/lib/format";
import type { CategoryProgress } from "@/lib/queries";

export function RemainingMonthlyCard({
  spentPct,
  categoryProgress,
}: {
  spentPct: number | null;
  categoryProgress: CategoryProgress[];
}) {
  const remainingPct = spentPct === null ? null : Math.max(0, Math.round(100 - spentPct));
  const tiles = categoryProgress
    .filter((c) => c.planned > 0)
    .sort((a, b) => b.planned - a.planned)
    .slice(0, 3);

  const TILE_STYLES = [
    { bg: "var(--tile-1-bg)", text: "var(--tile-1-text)" },
    { bg: "var(--tile-2-bg)", text: "var(--tile-2-text)" },
    { bg: "var(--tile-3-bg)", text: "var(--tile-3-text)" },
  ];

  return (
    <div className="flex h-full flex-col rounded-xl border border-border bg-surface p-5 shadow-card">
      <div className="flex items-center justify-between">
        <p className="text-heading text-text-2">Remaining Monthly</p>
      </div>

      {remainingPct !== null ? (
        <>
          <p className="tabular mt-2 text-5xl font-semibold tracking-tight text-text">
            {remainingPct}
            <span className="text-2xl text-text-faint">%</span>
          </p>
          <p className="mt-2 text-sm text-text-muted">
            {remainingPct >= 40
              ? "You're in great shape — your monthly usage is still very safe."
              : remainingPct >= 10
                ? "Getting close — keep an eye on spending for the rest of the month."
                : "Budget's nearly used up for this month."}
          </p>
        </>
      ) : (
        <p className="mt-2 text-sm text-text-muted">Set planned amounts on Categories to see this.</p>
      )}

      {tiles.length > 0 && (
        <div className="mt-5 grid grid-cols-3 gap-2">
          {tiles.map((c, i) => {
            const pct = c.planned > 0 ? Math.min(100, Math.round((c.actual / c.planned) * 100)) : 0;
            const style = TILE_STYLES[i];
            return (
              <div
                key={c.id}
                className="flex flex-col justify-between rounded-lg p-3"
                style={{ backgroundColor: style.bg, color: style.text, minHeight: 96 }}
              >
                <div>
                  <p className="tabular text-xl font-bold">{pct}%</p>
                  <p className="truncate text-xs font-medium opacity-90">{c.name}</p>
                </div>
                <p className="tabular truncate text-[10px] opacity-75">
                  {formatMoney(c.actual)} / {formatMoney(c.planned)}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
