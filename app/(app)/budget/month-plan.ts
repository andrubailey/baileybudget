import { getPeriods, pickPeriod } from "@/lib/periods";
import {
  getCategoryProgressForRange,
  getPostedRecurringIds,
  getRecurringTransactions,
  type CategoryProgress,
} from "@/lib/queries";
import { dayNumber, monthClock, occurrence, paceStatus } from "./month-math";

export { plural, wholeDollars } from "./month-math";

// The current month's plan, shared by the mobile Home and Money pages so
// "what's left" and "on pace" mean the same thing on both.

export type MonthBill = {
  id: string;
  description: string;
  amount: number;
  categoryId: string | null;
  // This month's due date.
  dueIso: string;
  // Day of the period (1-based) it falls on.
  dueDay: number;
  status: "posted" | "overdue" | "upcoming";
  // The next date this bill still needs paying — this month's if it hasn't
  // posted, otherwise next month's — and how many days away that is.
  nextIso: string;
  daysUntil: number;
  // Counts toward the budget (not in an excluded category like Tithe).
  inPlan: boolean;
};

// Ranks closest-to-or-past-limit first; spend with no plan behind it ranks
// above everything.
function budgetRatio(c: CategoryProgress) {
  if (c.planned > 0) return c.actual / c.planned;
  return c.actual > 0 ? Number.MAX_SAFE_INTEGER : 0;
}

export async function getMonthPlan() {
  const period = pickPeriod(await getPeriods());
  if (!period) return null;

  const [progress, rules, postedIds] = await Promise.all([
    getCategoryProgressForRange(period.start_date, period.end_date),
    getRecurringTransactions(),
    getPostedRecurringIds(period.id),
  ]);

  const todayIso = new Date().toISOString().slice(0, 10);
  const clock = monthClock(period.start_date, period.end_date, todayIso);
  const startDay = dayNumber(period.start_date);
  const periodYear = Number(period.start_date.slice(0, 4));
  const periodMonth0 = Number(period.start_date.slice(5, 7)) - 1;

  // Tithe and anything else kept out of the budget.
  const excludedIds = new Set(progress.filter((c) => c.exclude_from_budget).map((c) => c.id));
  const budgeted = progress
    .filter((c) => !c.exclude_from_budget && (c.planned !== 0 || c.actual !== 0))
    .sort((a, b) => budgetRatio(b) - budgetRatio(a));
  const notBudgeted = progress.filter((c) => c.exclude_from_budget && c.actual > 0);

  const bills: MonthBill[] = rules
    .filter((r) => r.kind === "expense" && r.is_active)
    .map((r) => {
      const dueIso = occurrence(periodYear, periodMonth0, r.day_of_month);
      const posted = postedIds.has(r.id);
      const status: MonthBill["status"] = posted ? "posted" : dueIso < todayIso ? "overdue" : "upcoming";
      const nextIso = status === "upcoming" ? dueIso : occurrence(periodYear, periodMonth0 + 1, r.day_of_month);
      return {
        id: r.id,
        description: r.description,
        amount: r.amount,
        categoryId: r.category_id,
        dueIso,
        dueDay: dayNumber(dueIso) - startDay + 1,
        status,
        nextIso,
        daysUntil: dayNumber(nextIso) - dayNumber(todayIso),
        inPlan: !r.category_id || !excludedIds.has(r.category_id),
      };
    });

  const planned = budgeted.reduce((sum, c) => sum + c.planned, 0);
  const spent = budgeted.reduce((sum, c) => sum + c.actual, 0);
  const remaining = planned - spent;
  const planBills = bills.filter((b) => b.inPlan);
  const billsStillToCome = planBills.filter((b) => b.status !== "posted").reduce((sum, b) => sum + b.amount, 0);

  // Expected spend by each day: every bill on its due day, plus the rest of
  // the plan spread evenly across the month.
  const billsTotal = planBills.reduce((sum, b) => sum + b.amount, 0);
  const flexible = Math.max(0, planned - billsTotal);
  const expectedByDay = Array.from({ length: clock.totalDays }, (_, i) => {
    const day = i + 1;
    const billsBy = planBills.filter((b) => b.dueDay <= day).reduce((sum, b) => sum + b.amount, 0);
    return Math.min(planned, billsBy + (flexible * day) / clock.totalDays);
  });

  // Actual spend by day, through today. Split transactions count toward
  // `actual` but aren't in the per-category lists (they carry no single
  // category), so whatever's unaccounted for is placed on today.
  const actualDaily = Array.from({ length: clock.today }, () => 0);
  let listed = 0;
  for (const c of budgeted) {
    for (const t of c.transactions) {
      const index = Math.min(clock.today - 1, Math.max(0, dayNumber(t.txn_date) - startDay));
      actualDaily[index] += t.amount;
      listed += t.amount;
    }
  }
  if (actualDaily.length > 0) actualDaily[actualDaily.length - 1] += spent - listed;
  let running = 0;
  const actualByDay = actualDaily.map((v) => (running += v));

  const pendingBillsByCategory = new Map<string, number>();
  const billCategoryIds = new Set<string>();
  for (const b of planBills) {
    if (!b.categoryId) continue;
    billCategoryIds.add(b.categoryId);
    if (b.status !== "posted") {
      pendingBillsByCategory.set(b.categoryId, (pendingBillsByCategory.get(b.categoryId) ?? 0) + b.amount);
    }
  }

  return {
    period,
    clock,
    budgeted,
    notBudgeted,
    planned,
    spent,
    remaining,
    billsStillToCome,
    leftAfterBills: remaining - billsStillToCome,
    pace: paceStatus(spent, planned, expectedByDay[clock.today - 1] ?? 0),
    expectedByDay,
    actualByDay,
    bills,
    pendingBillsByCategory,
    billCategoryIds,
  };
}

export type MonthPlan = NonNullable<Awaited<ReturnType<typeof getMonthPlan>>>;
