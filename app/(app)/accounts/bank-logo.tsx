const BANK_LOGOS: Record<string, string> = {
  Chase: "/logos/chase.jpg",
  "Chase for Business": "/logos/chase-business.jpeg",
  "CIT Bank": "/logos/cit-bank.png",
  Amex: "/logos/amex.svg",
};

export function BankLogo({ bank }: { bank: string }) {
  const src = BANK_LOGOS[bank];

  if (!src) {
    return (
      <span className="rounded-full bg-bg px-2 py-0.5 text-[11px] font-medium text-text-faint">
        {bank}
      </span>
    );
  }

  return (
    <span className="inline-flex h-6 items-center rounded-md border border-border bg-white p-0.5">
      {/* eslint-disable-next-line @next/next/no-img-element -- small static local logo, no need for next/image */}
      <img src={src} alt={bank} className="h-full w-auto rounded-sm object-contain" />
    </span>
  );
}
