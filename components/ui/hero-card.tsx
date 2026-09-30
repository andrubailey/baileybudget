import { formatMoney, splitMoney } from "./money";
import { StatusPill, type StatusTone } from "./status-pill";

// Gray rounded card with the screen's one large number. Pass value={null}
// while loading — the card keeps its exact height, so nothing jumps when
// the number arrives.
export function HeroCard({
  label,
  value,
  caption,
  status,
  children,
}: {
  label: string;
  value: number | null;
  caption?: React.ReactNode;
  status?: { label: string; tone: StatusTone };
  // Optional slot under the caption: a thin progress bar or sparkline.
  children?: React.ReactNode;
}) {
  const money = value === null ? null : splitMoney(value);
  return (
    <section className="rounded-(--radius-card) bg-(--bg-card-subtle) p-(--space-5)">
      <div className="flex min-h-(--space-6) items-center justify-between gap-(--space-3)">
        {/* A heading so the page's main answer is reachable by heading
            navigation, not skipped over (WCAG 1.3.1). */}
        <h2 className="ui-label">{label}</h2>
        {status && <StatusPill tone={status.tone}>{status.label}</StatusPill>}
      </div>
      <p className="ui-display mt-(--space-2)" aria-busy={money === null}>
        {money ? (
          <>
            {/* The cents are styled separately, which VoiceOver on iOS reads
                as two stops ("$1,240" … ".56"); this gives it one. */}
            <span className="sr-only">{formatMoney(value!)}</span>
            <span aria-hidden="true">
              {money.whole}
              <span className="ui-display-cents">{money.cents}</span>
            </span>
          </>
        ) : (
          <span
            aria-hidden="true"
            className="inline-block h-[1em] w-[5em] rounded-(--radius-field) bg-(--border-subtle) align-middle"
          />
        )}
      </p>
      {caption && <p className="ui-body mt-(--space-2) text-(--text-secondary)">{caption}</p>}
      {children && <div className="mt-(--space-4)">{children}</div>}
    </section>
  );
}
