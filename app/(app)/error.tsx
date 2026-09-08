"use client";

import { useEffect } from "react";
import Link from "next/link";

// Next.js renders this in place of any page under (app) whose Server or
// Client Component tree throws — without it, an unhandled error here just
// shows Next's generic unstyled crash screen with no way back in short of a
// manual reload.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-negative-bg text-2xl text-negative">
        ⚠
      </span>
      <div className="space-y-1">
        <p className="text-heading text-text">Something went wrong.</p>
        <p className="max-w-sm text-sm text-text-muted">
          That page hit an unexpected error. Your data is fine — this is just a display
          problem.
        </p>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent/90"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-text-muted hover:bg-bg"
        >
          Go to Overview
        </Link>
      </div>
    </div>
  );
}
