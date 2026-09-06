const BANK_LOGOS: Record<string, string> = {
  Chase: "/logos/chase.jpg",
  "Chase for Business": "/logos/chase-business.jpeg",
  "CIT Bank": "/logos/cit-bank.png",
  Amex: "/logos/amex.svg",
};

const SIZE_CLASSES = {
  sm: "h-5",
  md: "h-9",
  lg: "h-14",
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
      className={`inline-flex items-center rounded-md border border-border bg-white p-1 ${SIZE_CLASSES[size]}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- small static local logo, no need for next/image */}
      <img src={src} alt={bank} className="h-full w-auto rounded-sm object-contain" />
    </span>
  );
}
