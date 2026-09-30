import { Pressable } from "./pressable";

// Bold title on the left, a quiet tappable link on the right.
export function SectionHeader({
  title,
  action,
}: {
  title: React.ReactNode;
  action?: { label: string; href?: string; onPress?: () => void };
}) {
  return (
    <div className="flex items-center justify-between gap-(--space-3) pt-(--space-6) pb-(--space-2)">
      <h2 className="ui-body min-w-0 truncate font-semibold text-(--text-primary)">{title}</h2>
      {action && (
        <Pressable
          href={action.href}
          onPress={action.onPress}
          // Padding widens the tap target to ~44px without changing the look.
          className="-my-(--space-3) -mr-(--space-2) shrink-0 rounded-(--radius-pill) px-(--space-2) py-(--space-3) text-(length:--text-caption) font-medium text-(--text-secondary)"
        >
          {action.label}
        </Pressable>
      )}
    </div>
  );
}
