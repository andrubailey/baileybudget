const BANK_LOGOS: Record<string, string> = {
  Chase: "/logos/chase.jpg",
  "Chase for Business": "/logos/chase-business.jpeg",
  "CIT Bank": "/logos/cit-bank.png",
  Amex: "/logos/amex.svg",
};

// Fixed square boxes (not just a fixed height) — the source logos are all
// different aspect ratios (Chase's is wide, Amex's is closer to square), so
// leaving width to `w-auto` made every account's logo a different shape and
// size next to the others. `object-contain` inside a square box keeps each
// logo's own proportions intact while giving every account the same
// footprint.
const SIZE_CLASSES = {
  sm: "size-5",
  md: "size-9",
  lg: "size-14",
} as const;

export function BankLogo({
  bank,
  size = "md",
}: {
  bank: string;
  size?: keyof typeof SIZE_CLASSES;
}) {
  const src = BANK_LOGOS[bank];

  if (!src) {
    return (
      <span className="rounded-full bg-bg px-2 py-0.5 text-[11px] font-medium text-text-faint">
        {bank}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-md border border-border bg-white p-1 ${SIZE_CLASSES[size]}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- small static local logo, no need for next/image */}
      <img src={src} alt={bank} className="size-full rounded-sm object-contain" />
    </span>
  );
}
