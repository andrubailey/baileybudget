import { NewTransactionButton } from "@/app/(app)/new-transaction-button";

// Anchors "New transaction" to the bottom of the screen on mobile instead of
// tucked into the top bar — a thumb-reachable spot for the single most
// frequent action, matching the bottom-app-bar pattern most phone apps use.
export function MobileBottomBar() {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t border-hero-border bg-hero-bg px-4 py-3 lg:hidden"
      style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
    >
      <NewTransactionButton menuAlign="left" menuPosition="above" />
    </div>
  );
}
