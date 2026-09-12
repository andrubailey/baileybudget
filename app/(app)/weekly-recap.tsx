import {
  getAccountsWithBalances,
  getBalanceHistory,
  getCategoryProgressForRange,
  getPeriodSummaryForRange,
  getTransactionsForRange,
} from "@/lib/queries";
import type { RecapData } from "@/app/(app)/weekly-recap-card";

const DAY_MS = 86_400_000;
const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, days: number) {
  return new Date(d.getTime() + days * DAY_MS);
}

function ordinal(n: number) {
  const suffixes = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${suffixes[(v - 20) % 10] ?? suffixes[v] ?? suffixes[0]}`;
}

function monthName(d: Date, month: "long" | "short") {
  return d.toLocaleDateString("en-US", { month, timeZone: "UTC" });
}

// A new recap appears every Saturday, covering that Sunday through Saturday.
// On Saturday itself it's this week's (today inclusive); Sunday through
// Friday it's still last Saturday's, until the next one replaces it. The
// alert's dismissal (see weekly-recap-alert.tsx) is keyed by week, so
// reviewing one never hides the next. Plain data, not a component — it's
// fetched once in the shared layout (so the alert can surface app-wide, not
// just on the Overview page) and handed to the client-side alert as a prop.
export async function getWeeklyRecapData(): Promise<RecapData> {
  const today = new Date(`${iso(new Date())}T00:00:00Z`);
  const end = addDays(today, -((today.getUTCDay() + 1) % 7));
  const start = addDays(end, -6);
  const prevEnd = addDays(start, -1);
  const prevStart = addDays(prevEnd, -6);
  const historyDays = Math.round((today.getTime() - prevEnd.getTime()) / DAY_MS) + 1;

  const [summary, previousSummary, categoryProgress, transactions, balanceHistory, accounts] =
    await Promise.all([
      getPeriodSummaryForRange(iso(start), iso(end)),
      getPeriodSummaryForRange(iso(prevStart), iso(prevEnd)),
      getCategoryProgressForRange(iso(start), iso(end)),
      getTransactionsForRange(iso(start), iso(end)),
      getBalanceHistory(historyDays),
      getAccountsWithBalances(),
    ]);

  // Same debt-account inversion the rest of the app uses: a charge on a card
  // is stored as "income", and a card payment isn't new spending.
  const debtIds = new Set(accounts.filter((a) => a.is_debt).map((a) => a.id));
  const spends = transactions.filter((t) =>
    t.account_id && debtIds.has(t.account_id) ? t.kind === "income" : t.kind === "expense",
  );

  const byDay = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i);
    const key = iso(date);
    return {
      letter: DAY_LETTERS[date.getUTCDay()],
      day: date.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }),
      amount: spends.filter((t) => t.txn_date === key).reduce((sum, t) => sum + t.amount, 0),
    };
  });

  const weekPoints = balanceHistory
    .filter((p) => p.date >= iso(prevEnd) && p.date <= iso(end))
    .map((p) => p.balance);
  const biggest = spends.reduce<(typeof spends)[number] | null>(
    (best, t) => (!best || t.amount > best.amount ? t : best),
    null,
  );

  const sameMonth = start.getUTCMonth() === end.getUTCMonth();
  const data: RecapData = {
    weekKey: iso(start),
    rangeShort: sameMonth
      ? `${monthName(start, "long")} ${start.getUTCDate()}–${end.getUTCDate()}`
      : `${monthName(start, "short")} ${start.getUTCDate()} – ${monthName(end, "short")} ${end.getUTCDate()}`,
    rangeLong: `${monthName(start, "long")} ${ordinal(start.getUTCDate())} to ${monthName(end, "long")} ${ordinal(end.getUTCDate())}`,
    netWorth: {
      start: weekPoints[0] ?? 0,
      end: weekPoints[weekPoints.length - 1] ?? 0,
      points: weekPoints,
    },
    spending: { total: summary.expense, previous: previousSummary.expense, byDay },
    income: { total: summary.income, previous: previousSummary.income },
    topCategories: categoryProgress
      .filter((c) => c.actual > 0 && !/transfer/i.test(c.name))
      .sort((a, b) => b.actual - a.actual)
      .slice(0, 4)
      .map((c) => ({ name: c.name, icon: c.icon, amount: c.actual })),
    biggest: biggest
      ? { description: biggest.description, amount: biggest.amount, date: biggest.txn_date }
      : null,
    transactionCount: transactions.length,
  };

  return data;
}
