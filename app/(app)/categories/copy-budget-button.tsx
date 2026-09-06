"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { copyBudgetForward } from "@/app/actions";

export function CopyBudgetButton({
  fromPeriodId,
  fromPeriodName,
  toPeriodId,
}: {
  fromPeriodId: string;
  fromPeriodName: string;
  toPeriodId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  function handleClick() {
    startTransition(async () => {
      await copyBudgetForward(fromPeriodId, toPeriodId);
      setDone(true);
      router.refresh();
    });
  }

  if (done) {
    return <p className="text-sm text-text-muted">Copied planned amounts from {fromPeriodName}.</p>;
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-text-muted transition-colors hover:bg-bg disabled:opacity-50"
    >
      {isPending ? "Copying…" : `Copy planned amounts from ${fromPeriodName}`}
    </button>
  );
}
