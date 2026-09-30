import { formatMoney } from "./money";
import { Pressable } from "./pressable";

// A list row: optional leading icon/avatar, title and subtitle, and a
// right-aligned value (tabular figures).
export function Row({
  leading,
  title,
  subtitle,
  value,
  valueCaption,
  href,
  onPress,
}: {
  leading?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  // A number renders as money; anything else renders as given.
  value?: number | React.ReactNode;
  valueCaption?: React.ReactNode;
  href?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      href={href}
      onPress={onPress}
      className="flex min-h-(--space-8) w-full items-center gap-(--space-3) py-(--space-3)"
    >
      {leading && <span className="flex shrink-0 items-center">{leading}</span>}
      <span className="min-w-0 flex-1">
        <span className="ui-body block truncate font-medium text-(--text-primary)">{title}</span>
        {subtitle && <span className="ui-caption block truncate">{subtitle}</span>}
      </span>
      {value !== undefined && (
        <span className="shrink-0 text-right">
          <span className="ui-body ui-tabular block font-semibold text-(--text-primary)">
            {typeof value === "number" ? formatMoney(value) : value}
          </span>
          {valueCaption && <span className="ui-caption ui-tabular block">{valueCaption}</span>}
        </span>
      )}
    </Pressable>
  );
}

// A budget-style row: icon, name, spent of limit, a thin full-width bar,
// and an optional all-caps interpretive caption underneath.
export function ProgressRow({
  icon,
  name,
  spent,
  limit,
  caption,
  tone,
  href,
  onPress,
}: {
  icon?: React.ReactNode;
  name: React.ReactNode;
  spent: number;
  limit: number;
  // e.g. "On pace to go over" — rendered uppercase.
  caption?: React.ReactNode;
  // Bar color. Defaults to caution once spent reaches 90% of the limit.
  tone?: "positive" | "caution" | "neutral";
  href?: string;
  onPress?: () => void;
}) {
  const ratio = limit > 0 ? spent / limit : spent > 0 ? 1 : 0;
  const resolvedTone = tone ?? (ratio >= 0.9 ? "caution" : "positive");
  const fill =
    resolvedTone === "caution"
      ? "var(--accent-caution)"
      : resolvedTone === "positive"
        ? "var(--accent-positive)"
        : "var(--text-tertiary)";
  return (
    <Pressable href={href} onPress={onPress} className="block w-full py-(--space-4)">
      <span className="flex items-center gap-(--space-3)">
        {icon && <span className="flex shrink-0 items-center">{icon}</span>}
        <span className="ui-body min-w-0 flex-1 truncate font-medium text-(--text-primary)">{name}</span>
        <span className="ui-body ui-tabular shrink-0 text-right">
          <span className="font-semibold text-(--text-primary)">{formatMoney(spent, { cents: false })}</span>
          {limit > 0 && <span className="text-(--text-tertiary)"> of {formatMoney(limit, { cents: false })}</span>}
        </span>
      </span>
      <span
        className="ui-progress-track mt-(--space-3) block"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={spent}
      >
        <span
          className="ui-progress-fill block"
          style={{ background: fill, transform: `scaleX(${Math.min(1, Math.max(0, ratio))})` }}
        />
      </span>
      {caption && <span className="ui-label mt-(--space-2) block">{caption}</span>}
    </Pressable>
  );
}
