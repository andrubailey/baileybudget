// Wraps every page. Handles the safe-area inset on all four edges, sizes
// with dvh, and leaves room at the bottom for the home indicator plus the
// fixed <BottomNav>. Pages never pad their own bottom.
export function Screen({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <main className={`ui-screen ${className}`}>{children}</main>;
}
