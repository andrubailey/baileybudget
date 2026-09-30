// Large page title, one quiet line beneath, optional right-side icon slot.
export function PageHeader({
  title,
  subtitle,
  icon,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  // Right-aligned slot, e.g. an icon button. Keep it to one ~44px target.
  icon?: React.ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-(--space-3) pb-(--space-5)">
      <div className="min-w-0">
        <h1 className="ui-title">{title}</h1>
        {subtitle && <p className="ui-caption mt-(--space-1) truncate">{subtitle}</p>}
      </div>
      {icon && <div className="flex shrink-0 items-center">{icon}</div>}
    </header>
  );
}
