"use client";

import { useFormStatus } from "react-dom";

// Shared submit button for the app's forms — shows a pending state so a slow
// connection doesn't read as "did my click register?" and so a double-click
// can't fire the same server action twice.
export function SubmitButton({
  children,
  pendingText,
  className,
}: {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`${className ?? "rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"} disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {pending ? (pendingText ?? "Saving…") : children}
    </button>
  );
}
