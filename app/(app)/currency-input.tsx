"use client";

import { useState } from "react";

// Keeps digits and at most one decimal point — the value actually submitted
// with the form, so every existing `Number(formData.get("amount"))` call
// downstream keeps working unchanged.
function sanitize(input: string): string {
  let cleaned = input.replace(/[^\d.]/g, "");
  const firstDot = cleaned.indexOf(".");
  if (firstDot !== -1) {
    cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, "");
  }
  return cleaned;
}

function formatDisplay(raw: string): string {
  if (!raw) return "";
  const [intPart, decPart] = raw.split(".");
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return decPart !== undefined ? `${withCommas}.${decPart}` : withCommas;
}

// A `$`-prefixed amount field that grows thousands separators live as you
// type (previously only visible after formatting on blur elsewhere in the
// app). Submits its raw digits through a same-named hidden input, so it's a
// drop-in replacement for `<input type="number" name={name} .../>` — no
// change needed on the server-action side that reads `formData.get(name)`.
export function CurrencyInput({
  name,
  defaultValue,
  required,
  autoFocus,
  placeholder = "0.00",
  className,
}: {
  name: string;
  defaultValue?: number | string;
  required?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [raw, setRaw] = useState(
    defaultValue !== undefined && defaultValue !== "" ? String(defaultValue) : "",
  );

  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-text-faint">
        $
      </span>
      <input
        type="text"
        inputMode="decimal"
        autoFocus={autoFocus}
        required={required}
        placeholder={placeholder}
        value={formatDisplay(raw)}
        onChange={(e) => setRaw(sanitize(e.target.value))}
        className={
          className ??
          "w-full rounded-md border border-border bg-bg py-1.5 pr-2 pl-6 text-right text-sm text-text outline-none focus:border-accent"
        }
      />
      <input type="hidden" name={name} value={raw} />
    </div>
  );
}
