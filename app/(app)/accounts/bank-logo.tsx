const BANK_STYLES: Record<string, { bg: string; fg: string; label: string }> = {
  Chase: { bg: "#117aca", fg: "#ffffff", label: "Chase" },
  "CIT Bank": { bg: "#0b2545", fg: "#ffffff", label: "CIT Bank" },
  Amex: { bg: "#006fcf", fg: "#ffffff", label: "AMEX" },
};

export function BankLogo({ bank }: { bank: string }) {
  const style = BANK_STYLES[bank];

  if (!style) {
    return (
      <span className="rounded-full bg-bg px-2 py-0.5 text-[11px] font-medium text-text-faint">
        {bank}
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold tracking-tight"
      style={{ backgroundColor: style.bg, color: style.fg }}
    >
      {style.label}
    </span>
  );
}
