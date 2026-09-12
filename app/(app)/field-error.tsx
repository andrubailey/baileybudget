// A validation error appearing (or clearing) animates its own height in
// instead of snapping the field/button below it down or up the instant it
// shows or clears. Grid-rows is the one reliable way to transition to/from
// "however tall this text actually is" — height/max-height both need a
// real pixel target, which error text of varying length doesn't have.
export function FieldError({
  error,
  className = "text-sm text-negative",
}: {
  error: string | null;
  className?: string;
}) {
  return (
    <div
      className="grid transition-[grid-template-rows] duration-200 ease-out"
      style={{ gridTemplateRows: error ? "1fr" : "0fr" }}
    >
      <div className="overflow-hidden">
        <p className={`${error ? "pt-1" : ""} ${className}`}>{error}</p>
      </div>
    </div>
  );
}
