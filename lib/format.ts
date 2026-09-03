export function formatMoney(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

// Red under a third of the way to goal, amber in the middle third, green in the final third.
export function progressColor(pct: number): string {
  if (pct < 33) return "#f04438";
  if (pct < 66) return "#f79009";
  return "#17b26a";
}
