// Every page's title block — title, one-line description, and an optional
// slot for the page's primary action(s) on the right. Seven pages each
// hand-copied the same six utility classes for the h1 before this; now
// the type role lives in .text-page-title and the layout lives here.
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  // Small line above the title (the dashboard's greeting).
  eyebrow?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="text-sm font-medium text-text-muted">{eyebrow}</p>}
        <h1 className={`text-page-title text-text ${eyebrow ? "mt-1" : ""}`}>{title}</h1>
        {description && <p className="mt-1 text-sm text-text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}
