"use client";

import { QuickAddTransferButton } from "@/app/(app)/quick-add-transfer";
import type { Account } from "@/lib/types";

// Thin client wrapper so the Accounts page (a Server Component) doesn't try
// to pass a `renderTrigger` function prop directly to QuickAddTransferButton
// — plain functions aren't serializable across the server/client boundary,
// which crashed the whole page with "Functions cannot be passed directly to
// Client Components." Defining the trigger here, client-side, avoids that.
export function AddTransferButton({
  periodId,
  accounts,
}: {
  periodId: string;
  accounts: Account[];
}) {
  return (
    <QuickAddTransferButton
      periodId={periodId}
      accounts={accounts}
      renderTrigger={(open) => (
        <button
          type="button"
          onClick={open}
          className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-text-muted transition-colors hover:bg-bg"
        >
          + Add transfer
        </button>
      )}
    />
  );
}
