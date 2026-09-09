import { formatMoney } from "@/lib/format";

// The one place every rendered dollar figure in the app goes through, so
// "how a number looks" is a handful of decisions made once here instead of
// re-litigated (inconsistently) at each of the ~30 places that print money.
//
// Three decisions this makes on the caller's behalf:
//
// 1. Tabular figures, always. `formatMoney` never gets rendered as plain
//    text — every digit sits in a fixed-width slot so a column of amounts
//    (a transaction list, a budget table) aligns on the decimal point
//    instead of ragged-right jittering as amounts change size.
//
// 2. Cents de-emphasized, but only at "balance" size. A 34px headline
//    balance with full-weight ".00" reads as two numbers competing for
//    attention — the whole-dollar figure is the fact that matters, cents
//    are a footnote. A 14px line-item amount is already small; shrinking
//    its cents further makes them illegible, so `variant="amount"` (the
//    default) leaves them full-weight.
//
// 3. Sign and color are the caller's call, not arithmetic. `amount` is
//    always the magnitude — the sign shown is `signDisplay`, and the color
//    is `tone`. This is deliberate: a $40 expense is not "bad" and
//    shouldn't render in the same red as a category that's over budget,
//    even though a naive implementation would color anything framed as
//    "money leaving" the same way. Judgment lives in the token system
//    (`text-positive` / `text-negative` / plain `text-text`), and the
//    caller — who knows whether this number represents a routine expense
//    or an actual problem — decides which one applies. Money never guesses
//    a tone from the sign of the number.
export function Money({
  amount,
  variant = "amount",
  signDisplay = "none",
  tone,
  className = "",
}: {
  amount: number;
  // "balance" — a headline figure (Net Worth, an account balance, a
  // report total): cents shrink and fade. "amount" — a line-item figure in
  // a list/table row: cents stay full-weight since the whole number is
  // already small.
  variant?: "balance" | "amount";
  // "+" / "-" force that sign regardless of `amount`'s own sign (the data
  // model stores transaction amounts as positive magnitudes; kind decides
  // the displayed sign). "auto" reads the sign off `amount` itself, for
  // values that are genuinely signed (remaining budget, net change).
  // "none" (default) shows no sign — the plain magnitude.
  signDisplay?: "+" | "-" | "auto" | "none";
  // Explicit color role — omit for the surrounding text color. Never
  // derived automatically from the sign; see note above.
  tone?: "positive" | "negative" | "neutral";
  className?: string;
}) {
  const sign =
    signDisplay === "auto" ? (amount < 0 ? "-" : "") : signDisplay === "none" ? "" : signDisplay;
  const formatted = formatMoney(Math.abs(amount));
  const toneClass =
    tone === "positive"
      ? "text-positive"
      : tone === "negative"
        ? "text-negative"
        : tone === "neutral"
          ? "text-text"
          : "";
  const dotIndex = formatted.indexOf(".");

  if (variant !== "balance" || dotIndex === -1) {
    return (
      <span className={`tabular ${toneClass} ${className}`}>
        {sign}
        {formatted}
      </span>
    );
  }

  return (
    <span className={`tabular ${toneClass} ${className}`}>
      {sign}
      {formatted.slice(0, dotIndex)}
      <span className="text-[0.6em] opacity-60">{formatted.slice(dotIndex)}</span>
    </span>
  );
}
