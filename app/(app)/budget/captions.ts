import { wholeDollars } from "./month-math";

// The one-line read under a category's bar. Rules, in order:
//   - Say the plain fact when there is one (over, used up, nearly used up,
//     a bill still coming).
//   - Only judge pace for day-to-day categories, and only once enough of
//     the month has passed for pace to mean anything. Bill-driven
//     categories move in lumps (rent lands on the 1st), so pace would lie.
//   - Otherwise say nothing. Never scold: facts and pace, no "careful!".
// Rendered uppercase by the row, so these are written in plain case.
export function categoryCaption({
  planned,
  actual,
  elapsedPct,
  pendingBills,
  hasBills,
}: {
  planned: number;
  actual: number;
  elapsedPct: number;
  // Unposted bills in this category this month.
  pendingBills: number;
  // Any recurring bill is filed under this category.
  hasBills: boolean;
}): string | null {
  if (planned <= 0) return actual > 0 ? "Not in the plan" : null;

  const left = planned - actual;
  if (left <= -1) return `Over by ${wholeDollars(-left)}`;

  if (pendingBills > 0) {
    const afterBills = left - pendingBills;
    return afterBills <= -1
      ? `Bills still to come put it over by ${wholeDollars(-afterBills)}`
      : `${wholeDollars(pendingBills)} in bills still to come`;
  }

  if (left < 1) return hasBills ? "Paid for the month" : "All used";
  const spentPct = (actual / planned) * 100;
  if (spentPct >= 85) return `${wholeDollars(left)} left`;

  if (hasBills || elapsedPct < 20) return null;

  if (elapsedPct >= 45 && spentPct < 10) {
    const phase =
      elapsedPct < 60 ? "half the month gone" : elapsedPct < 85 ? "most of the month gone" : "the month nearly over";
    return `${actual === 0 ? "Untouched" : "Barely touched"} with ${phase}`;
  }

  const ahead = spentPct - elapsedPct;
  if (ahead >= 20) return "Spending faster than planned";
  if (Math.abs(ahead) <= 8) return "On track";
  return null;
}
