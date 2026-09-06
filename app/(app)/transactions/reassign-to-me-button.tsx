"use client";

import { useState } from "react";
import { reassignAllTransactionsToMe } from "@/app/actions";

export function ReassignToMeButton() {
  const [isPending, setIsPending] = useState(false);

  async function handleClick() {
    if (
      !window.confirm(
        "Mark every transaction as logged by you? This overwrites the \"By\" attribution on all existing transactions, including ones your partner logged.",
      )
    ) {
      return;
    }
    setIsPending(true);
    await reassignAllTransactionsToMe();
    setIsPending(false);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text-muted hover:bg-bg disabled:opacity-50"
    >
      {isPending ? "Updating…" : "Mark all as mine"}
    </button>
  );
}
