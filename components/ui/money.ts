const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const wholeCurrency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

// "-$1,234.56" -> { whole: "-$1,234", cents: ".56" }
export function splitMoney(value: number): { whole: string; cents: string } {
  let whole = "";
  let cents = "";
  for (const part of currency.formatToParts(value)) {
    if (part.type === "decimal" || part.type === "fraction") cents += part.value;
    else whole += part.value;
  }
  return { whole, cents };
}

export function formatMoney(value: number, { cents = true }: { cents?: boolean } = {}) {
  return (cents ? currency : wholeCurrency).format(value);
}
