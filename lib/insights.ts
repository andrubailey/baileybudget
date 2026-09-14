import {
  getAccountsWithBalances,
  getAllTransactions,
  getCategories,
  getObjectives,
  getRecurringTransactions,
} from "@/lib/queries";
import { snapshotClient } from "@/lib/snapshot";
import { formatDate, formatMoney } from "@/lib/format";
import type { Objective, Transaction } from "@/lib/types";
import {
  addMonthKey,
  monthEndIso,
  monthKeyOf,
  monthKeysBetween,
  monthStartIso,
  type ResolvedInsightsRange,
} from "@/lib/insights-prefs";

// ============================================================================
// Insights — every card on the Insights page, computed from the same cached
// snapshot as the rest of the app. Two rules shape everything here:
//
// 1. Every figure carries the link to the exact transactions behind it (see
//    txHref), so nothing on the page is unverifiable.
// 2. When a range or the household's history is too thin to say something
//    honestly, a card returns { status: "insufficient", reason } instead of
//    a misleading number. "History" starts at the first month with real
//    tracking (TRACKED_MONTH_MIN transactions) — the handful of stray
//    entries before that don't count as a baseline.
// ============================================================================

const TRACKED_MONTH_MIN = 20;

export type Part = string | { text: string; href: string };
export type Insufficient = { status: "insufficient"; reason: string };

export function txHref(opts: {
  start?: string;
  end?: string;
  flow?: "in" | "out";
  category?: string;
  account?: string;
  q?: string;
}) {
  const params = new URLSearchParams({ period: "all" });
  if (opts.start && opts.end) {
    params.set("start", opts.start);
    params.set("end", opts.end);
  }
  if (opts.flow) params.set("flow", opts.flow);
  if (opts.category) params.set("category", opts.category);
  if (opts.account) params.set("account", opts.account);
  if (opts.q) params.set("q", opts.q);
  return `/transactions?${params.toString()}`;
}

const money = (amount: number, href: string): Part => ({ text: formatMoney(amount), href });

function monthLabel(key: string, style: "long" | "short" = "short", withYear = true) {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    month: style,
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

function rangeText(start: string, end: string) {
  return start === end ? formatDate(start) : `${formatDate(start)} – ${formatDate(end)}`;
}

function quantile(sorted: number[], q: number) {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (pos - lower);
}

function pctChange(current: number, prior: number) {
  return prior > 0 ? ((current - prior) / prior) * 100 : null;
}

// Kendall's tau: +1 when every later month is higher than every earlier one,
// -1 when every later month is lower. Robust to one odd month in a way a
// plain "first vs last" comparison isn't.
function kendallTau(values: number[]) {
  let concordant = 0;
  let discordant = 0;
  for (let i = 0; i < values.length; i++) {
    for (let j = i + 1; j < values.length; j++) {
      if (values[j] > values[i]) concordant++;
      else if (values[j] < values[i]) discordant++;
    }
  }
  const pairs = (values.length * (values.length - 1)) / 2;
  return pairs > 0 ? (concordant - discordant) / pairs : 0;
}

// Share of the month-to-month variation a straight line explains (R²).
function linearFit(values: number[]) {
  const n = values.length;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let sst = 0;
  values.forEach((y, x) => {
    sxy += (x - meanX) * (y - meanY);
    sxx += (x - meanX) ** 2;
    sst += (y - meanY) ** 2;
  });
  const slope = sxx > 0 ? sxy / sxx : 0;
  const intercept = meanY - slope * meanX;
  let sse = 0;
  values.forEach((y, x) => {
    sse += (y - (intercept + slope * x)) ** 2;
  });
  return { slope, meanY, r2: sst > 0 ? 1 - sse / sst : 0 };
}

// ---------------------------------------------------------------------------
// Card data shapes (serializable — handed straight to the client view).
// ---------------------------------------------------------------------------

export type CashFlowCardData = {
  status: "ok";
  income: number;
  spending: number;
  net: number;
  savingsRate: number | null;
  incomeHref: string;
  spendingHref: string;
  partial: boolean;
};

export type WhereCardData =
  | {
      status: "ok";
      total: number;
      totalHref: string;
      categories: { id: string; name: string; icon: string | null; amount: number; share: number; href: string }[];
      moreCount: number;
    }
  | Insufficient;

export type HistoryCardData =
  | {
      status: "ok";
      current: number;
      currentHref: string;
      priorAverage: number;
      priorWindows: { label: string; amount: number; href: string }[];
      pct: number | null;
      comparisonLabel: string;
      typical: {
        perMonth: number;
        low: number;
        median: number;
        high: number;
        months: number;
        position: "below" | "within" | "above";
        baselineHref: string;
      } | null;
    }
  | Insufficient;

export type BudgetCardData =
  | {
      status: "ok";
      monthsLabel: string;
      includesCurrentMonth: boolean;
      planned: number;
      spent: number;
      spentHref: string;
      budgetedCount: number;
      overCount: number;
      overCategories: { id: string; name: string; icon: string | null; spent: number; planned: number; href: string }[];
    }
  | Insufficient;

export type GoalsCardData =
  | {
      status: "ok";
      items: {
        id: string;
        name: string;
        current: number;
        target: number;
        pct: number;
        href: string;
        monthlyAdded: number | null;
        addedHref: string | null;
        projection: string | null;
      }[];
    }
  | Insufficient;

export type RecurringCardData =
  | {
      status: "ok";
      annualTotal: number;
      monthlyTotal: number;
      count: number;
      items: { id: string; description: string; monthly: number; annual: number; href: string }[];
      share: number | null;
    }
  | Insufficient;

export type Finding = {
  id: string;
  label: string;
  title: string;
  parts: Part[];
  basis: "statistical" | "threshold" | "projection";
  direction: "up" | "down" | "neutral";
  impact: number;
  series?: { label: string; value: number; href: string }[];
};

export type InsightsData = {
  range: ResolvedInsightsRange;
  rangeText: string;
  trackingStartLabel: string | null;
  cashflow: CashFlowCardData;
  where: WhereCardData;
  history: HistoryCardData;
  budget: BudgetCardData;
  goals: GoalsCardData;
  recurring: RecurringCardData;
  findings: Finding[];
  headline: { kind: "finding"; id: string } | { kind: "card"; id: "history" | "where" };
};

const MAX_FINDINGS = 3;

export async function computeInsights(range: ResolvedInsightsRange, todayIso: string): Promise<InsightsData> {
  const supabase = snapshotClient();
  const [transactions, accounts, categories, recurring, objectives, budgetLinesResult, periodsResult] =
    await Promise.all([
      getAllTransactions(),
      getAccountsWithBalances(),
      getCategories(),
      getRecurringTransactions().catch(() => []),
      getObjectives().catch(() => [] as Objective[]),
      supabase.from("budget_lines").select("*"),
      supabase.from("periods").select("id, start_date"),
    ]);

  const debtIds = new Set(accounts.filter((a) => a.is_debt).map((a) => a.id));
  const catById = new Map(categories.map((c) => [c.id, c]));
  const thisMonth = monthKeyOf(todayIso);
  const lastFullMonth = addMonthKey(thisMonth, -1);

  // A charge on a card is stored as "income" on that debt account and a
  // card payment as "expense" — the same reclassification every other
  // money-in/money-out figure in the app uses.
  function flowOf(t: Transaction): "in" | "out" | null {
    if (t.kind !== "income" && t.kind !== "expense") return null;
    const isDebt = t.account_id ? debtIds.has(t.account_id) : false;
    if (!isDebt) return t.kind === "income" ? "in" : "out";
    return t.kind === "income" ? "out" : null;
  }

  const spendTxns = transactions.filter((t) => flowOf(t) === "out");
  const incomeTxns = transactions.filter((t) => flowOf(t) === "in");
  const sumBetween = (list: Transaction[], start: string, end: string) =>
    list.reduce((s, t) => (t.txn_date >= start && t.txn_date <= end ? s + Number(t.amount) : s), 0);
  const spendBetween = (start: string, end: string) => sumBetween(spendTxns, start, end);

  // Where real tracking begins.
  const countByMonth = new Map<string, number>();
  for (const t of transactions) {
    const k = monthKeyOf(t.txn_date);
    countByMonth.set(k, (countByMonth.get(k) ?? 0) + 1);
  }
  const trackingStart = [...countByMonth.entries()]
    .filter(([, n]) => n >= TRACKED_MONTH_MIN)
    .map(([k]) => k)
    .sort()[0] ?? null;
  const trackingStartLabel = trackingStart ? monthLabel(trackingStart, "short") : null;
  const isTracked = (key: string) => trackingStart !== null && key >= trackingStart && key <= thisMonth;
  const notEnoughHistory = (needed: string) =>
    trackingStartLabel
      ? `Not enough history to ${needed} yet — tracking began ${trackingStartLabel}.`
      : `Not enough history to ${needed} yet.`;

  // Monthly spend per category (categorized spending only).
  const catMonth = new Map<string, Map<string, number>>();
  for (const t of spendTxns) {
    if (!t.category_id) continue;
    const k = monthKeyOf(t.txn_date);
    const byCat = catMonth.get(k) ?? new Map<string, number>();
    byCat.set(t.category_id, (byCat.get(t.category_id) ?? 0) + Number(t.amount));
    catMonth.set(k, byCat);
  }
  const catSpendInMonth = (catId: string, key: string) => catMonth.get(key)?.get(catId) ?? 0;
  const firstMonthByCat = new Map<string, string>();
  for (const [k, byCat] of [...catMonth.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    for (const catId of byCat.keys()) if (!firstMonthByCat.has(catId)) firstMonthByCat.set(catId, k);
  }
  const monthSpend = (key: string) => spendBetween(monthStartIso(key), monthEndIso(key));
  const trackedFullMonthsBefore = (beforeKey: string, limit: number) =>
    monthKeysBetween(trackingStart ?? beforeKey, addMonthKey(beforeKey, -1))
      .filter((k) => isTracked(k) && k <= lastFullMonth)
      .slice(-limit);

  // ---- Cash flow -----------------------------------------------------------
  const income = sumBetween(incomeTxns, range.start, range.end);
  const spending = spendBetween(range.start, range.end);
  const cashflow: CashFlowCardData = {
    status: "ok",
    income,
    spending,
    net: income - spending,
    savingsRate: income > 0 ? (income - spending) / income : null,
    incomeHref: txHref({ start: range.start, end: range.end, flow: "in" }),
    spendingHref: txHref({ start: range.start, end: range.end, flow: "out" }),
    partial: range.partial,
  };

  // ---- Where it went -------------------------------------------------------
  const rangeCatTotals = new Map<string, number>();
  for (const t of spendTxns) {
    if (!t.category_id || t.txn_date < range.start || t.txn_date > range.end) continue;
    rangeCatTotals.set(t.category_id, (rangeCatTotals.get(t.category_id) ?? 0) + Number(t.amount));
  }
  const rankedCats = [...rangeCatTotals.entries()].sort((a, b) => b[1] - a[1]);
  const where: WhereCardData =
    spending <= 0
      ? { status: "insufficient", reason: "No spending logged in this range." }
      : {
          status: "ok",
          total: spending,
          totalHref: cashflow.spendingHref,
          categories: rankedCats.slice(0, 5).map(([id, amount]) => ({
            id,
            name: catById.get(id)?.name ?? "Uncategorized",
            icon: catById.get(id)?.icon ?? null,
            amount,
            share: amount / spending,
            href: txHref({ start: range.start, end: range.end, flow: "out", category: id }),
          })),
          moreCount: Math.max(0, rankedCats.length - 5),
        };

  // ---- Compared with your history ------------------------------------------
  let history: HistoryCardData;
  const singleMonthToDate = range.start === monthStartIso(thisMonth) && range.end === todayIso;
  const monthAligned =
    !range.partial &&
    range.fullMonths.length > 0 &&
    range.start === monthStartIso(range.fullMonths[0]) &&
    range.end === monthEndIso(range.fullMonths[range.fullMonths.length - 1]);

  if (singleMonthToDate) {
    // A month in progress is compared by pace: the same days of each of the
    // previous three months, not their full totals.
    const day = Number(todayIso.slice(8, 10));
    const priorKeys = [1, 2, 3].map((n) => addMonthKey(thisMonth, -n)).reverse();
    if (!priorKeys.every(isTracked)) {
      history = { status: "insufficient", reason: notEnoughHistory("compare this month's pace") };
    } else {
      const priorWindows = priorKeys.map((k) => {
        const start = monthStartIso(k);
        const lastDay = Number(monthEndIso(k).slice(8, 10));
        const end = `${k}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
        return {
          label: `${monthLabel(k, "short", false)} 1–${Math.min(day, lastDay)}`,
          amount: spendBetween(start, end),
          href: txHref({ start, end, flow: "out" }),
        };
      });
      const priorAverage = priorWindows.reduce((s, w) => s + w.amount, 0) / priorWindows.length;
      history = {
        status: "ok",
        current: spending,
        currentHref: cashflow.spendingHref,
        priorAverage,
        priorWindows,
        pct: pctChange(spending, priorAverage),
        comparisonLabel: `the first ${day} days of the previous 3 months`,
        typical: null,
      };
    }
  } else if (monthAligned) {
    const n = range.fullMonths.length;
    const priorStartKey = addMonthKey(range.fullMonths[0], -n);
    const priorEndKey = addMonthKey(range.fullMonths[0], -1);
    if (!isTracked(priorStartKey)) {
      history = {
        status: "insufficient",
        reason: notEnoughHistory(`compare against the ${n === 1 ? "previous month" : `previous ${n} months`}`),
      };
    } else {
      const priorStart = monthStartIso(priorStartKey);
      const priorEnd = monthEndIso(priorEndKey);
      const prior = spendBetween(priorStart, priorEnd);
      const baselineKeys = trackedFullMonthsBefore(range.fullMonths[0], 12);
      let typical: Extract<HistoryCardData, { status: "ok" }>["typical"] = null;
      if (baselineKeys.length >= 6) {
        const values = baselineKeys.map(monthSpend).sort((a, b) => a - b);
        const perMonth = spending / n;
        const low = quantile(values, 0.25);
        const high = quantile(values, 0.75);
        typical = {
          perMonth,
          low,
          median: quantile(values, 0.5),
          high,
          months: baselineKeys.length,
          position: perMonth < low ? "below" : perMonth > high ? "above" : "within",
          baselineHref: txHref({
            start: monthStartIso(baselineKeys[0]),
            end: monthEndIso(baselineKeys[baselineKeys.length - 1]),
            flow: "out",
          }),
        };
      }
      history = {
        status: "ok",
        current: spending,
        currentHref: cashflow.spendingHref,
        priorAverage: prior,
        priorWindows: [
          {
            label: n === 1 ? monthLabel(priorStartKey, "long") : `${monthLabel(priorStartKey)} – ${monthLabel(priorEndKey)}`,
            amount: prior,
            href: txHref({ start: priorStart, end: priorEnd, flow: "out" }),
          },
        ],
        pct: pctChange(spending, prior),
        comparisonLabel: n === 1 ? monthLabel(priorStartKey, "long") : `the prior ${n} months`,
        typical,
      };
    }
  } else {
    // Year to date / custom: the same number of days immediately before.
    const startDate = new Date(`${range.start}T00:00:00Z`);
    const days = Math.round((new Date(`${range.end}T00:00:00Z`).getTime() - startDate.getTime()) / 86_400_000) + 1;
    const priorEnd = new Date(startDate.getTime() - 86_400_000).toISOString().slice(0, 10);
    const priorStart = new Date(startDate.getTime() - days * 86_400_000).toISOString().slice(0, 10);
    if (!trackingStart || priorStart < monthStartIso(trackingStart)) {
      history = {
        status: "insufficient",
        reason: notEnoughHistory(`compare against the ${days} days before this range`),
      };
    } else {
      const prior = spendBetween(priorStart, priorEnd);
      history = {
        status: "ok",
        current: spending,
        currentHref: cashflow.spendingHref,
        priorAverage: prior,
        priorWindows: [{ label: rangeText(priorStart, priorEnd), amount: prior, href: txHref({ start: priorStart, end: priorEnd, flow: "out" }) }],
        pct: pctChange(spending, prior),
        comparisonLabel: `the ${days} days before`,
        typical: null,
      };
    }
  }

  // ---- Budget --------------------------------------------------------------
  const periodMonth = new Map(
    ((periodsResult.data ?? []) as { id: string; start_date: string }[]).map((p) => [p.id, monthKeyOf(p.start_date)]),
  );
  const plannedByMonthCat = new Map<string, Map<string, number>>();
  for (const line of (budgetLinesResult.data ?? []) as { period_id: string; category_id: string; planned_amount: number }[]) {
    const k = periodMonth.get(line.period_id);
    const amount = Number(line.planned_amount);
    if (!k || !(amount > 0)) continue;
    const byCat = plannedByMonthCat.get(k) ?? new Map<string, number>();
    byCat.set(line.category_id, (byCat.get(line.category_id) ?? 0) + amount);
    plannedByMonthCat.set(k, byCat);
  }
  const budgetMonths = [...range.fullMonths, ...(range.partial ? [thisMonth] : [])].filter((k) =>
    plannedByMonthCat.has(k),
  );
  let budget: BudgetCardData;
  if (budgetMonths.length === 0) {
    budget = {
      status: "insufficient",
      reason:
        range.fullMonths.length === 0 && !range.partial
          ? "Budgets are set by month, and this range doesn't cover a whole month."
          : "No budget is set for the months in this range.",
    };
  } else {
    const plannedByCat = new Map<string, number>();
    const spentByCat = new Map<string, number>();
    let spent = 0;
    for (const k of budgetMonths) {
      for (const [catId, amount] of plannedByMonthCat.get(k)!) {
        plannedByCat.set(catId, (plannedByCat.get(catId) ?? 0) + amount);
      }
      const end = k === thisMonth ? todayIso : monthEndIso(k);
      spent += spendBetween(monthStartIso(k), end);
      for (const [catId, amount] of catMonth.get(k) ?? []) spentByCat.set(catId, (spentByCat.get(catId) ?? 0) + amount);
    }
    const first = budgetMonths[0];
    const last = budgetMonths[budgetMonths.length - 1];
    const spanStart = monthStartIso(first);
    const spanEnd = last === thisMonth ? todayIso : monthEndIso(last);
    const over = [...plannedByCat.entries()]
      .map(([id, planned]) => ({ id, planned, spent: spentByCat.get(id) ?? 0 }))
      .filter((c) => c.spent > c.planned)
      .sort((a, b) => b.spent - b.planned - (a.spent - a.planned));
    budget = {
      status: "ok",
      monthsLabel:
        budgetMonths.length === 1
          ? monthLabel(first, "long")
          : `${budgetMonths.length} budgeted months (${monthLabel(first)} – ${monthLabel(last)})`,
      includesCurrentMonth: budgetMonths.includes(thisMonth),
      planned: [...plannedByCat.values()].reduce((s, v) => s + v, 0),
      spent,
      spentHref: txHref({ start: spanStart, end: spanEnd, flow: "out" }),
      budgetedCount: plannedByCat.size,
      overCount: over.length,
      overCategories: over.slice(0, 3).map((c) => ({
        ...c,
        name: catById.get(c.id)?.name ?? "Category",
        icon: catById.get(c.id)?.icon ?? null,
        href: txHref({ start: spanStart, end: spanEnd, flow: "out", category: c.id }),
      })),
    };
  }

  // ---- Savings goals ---------------------------------------------------------
  const contributionKeys = [2, 1, 0].map((n) => addMonthKey(lastFullMonth, -n));
  const contributionsTracked = contributionKeys.every(isTracked);
  const contribStart = monthStartIso(contributionKeys[0]);
  const contribEnd = monthEndIso(contributionKeys[2]);
  function netAdded(accountId: string) {
    let net = 0;
    for (const t of transactions) {
      if (t.txn_date < contribStart || t.txn_date > contribEnd) continue;
      const amount = Number(t.amount);
      if (t.kind === "transfer") {
        if (t.account_id === accountId) net -= amount;
        if (t.to_account_id === accountId) net += amount;
      } else if (t.account_id === accountId) {
        net += t.kind === "income" ? amount : -amount;
      }
    }
    return net / 3;
  }
  const objectiveByAccount = new Map(
    objectives.filter((o) => o.linked_account_id && o.status !== "Achieved").map((o) => [o.linked_account_id!, o]),
  );
  const goalItems = accounts
    .filter((a) => a.is_active && !a.is_debt && a.goal && a.goal > 0)
    .map((a) => {
      const target = Number(a.goal);
      const monthlyAdded = contributionsTracked ? netAdded(a.id) : null;
      const remaining = target - a.balance;
      let projection: string | null = null;
      if (remaining <= 0) projection = "Target reached";
      else if (monthlyAdded !== null && monthlyAdded > 0) {
        projection = `At the recent pace, about ${monthLabel(addMonthKey(thisMonth, Math.ceil(remaining / monthlyAdded)), "short")}`;
      }
      return {
        id: a.id,
        name: objectiveByAccount.get(a.id)?.name ?? a.name,
        current: a.balance,
        target,
        pct: Math.max(0, Math.min(1, a.balance / target)),
        href: txHref({ account: a.id }),
        monthlyAdded,
        addedHref: monthlyAdded !== null ? txHref({ start: contribStart, end: contribEnd, account: a.id }) : null,
        projection,
      };
    })
    .sort((a, b) => b.pct - a.pct);
  const goals: GoalsCardData =
    goalItems.length === 0
      ? { status: "insufficient", reason: "No savings targets are set on any account yet." }
      : { status: "ok", items: goalItems.slice(0, 5) };

  // ---- Recurring costs --------------------------------------------------------
  const activeRules = recurring.filter((r) => r.is_active && !r.deleted_at && r.kind === "expense");
  const trackedFullMonths = trackedFullMonthsBefore(thisMonth, 12);
  const typicalMonthlySpend =
    trackedFullMonths.length >= 3 ? quantile(trackedFullMonths.map(monthSpend).sort((a, b) => a - b), 0.5) : null;
  const recurringMonthly = activeRules.reduce((s, r) => s + Number(r.amount), 0);
  const recurringCard: RecurringCardData =
    activeRules.length === 0
      ? { status: "insufficient", reason: "No recurring bills are set up." }
      : {
          status: "ok",
          annualTotal: recurringMonthly * 12,
          monthlyTotal: recurringMonthly,
          count: activeRules.length,
          items: [...activeRules]
            .sort((a, b) => Number(b.amount) - Number(a.amount))
            .slice(0, 4)
            .map((r) => ({
              id: r.id,
              description: r.description,
              monthly: Number(r.amount),
              annual: Number(r.amount) * 12,
              href: txHref({ q: r.description }),
            })),
          share: typicalMonthlySpend && typicalMonthlySpend > 0 ? recurringMonthly / typicalMonthlySpend : null,
        };

  // ---- Worth noticing ----------------------------------------------------------
  const findings: Finding[] = [];
  const catName = (id: string) => catById.get(id)?.name ?? "A category";
  // Categories for moving money between your own accounts ("Transfer to
  // savings") swing with those moves, not with spending habits — they stay
  // in Where it went and Cash flow, but never drive a finding.
  const isTransferCategory = (id: string) => /transfer/i.test(catById.get(id)?.name ?? "");
  const catHref = (id: string, start: string, end: string) => txHref({ start, end, flow: "out", category: id });

  // Trend — statistical: steady direction over the last 6 full months.
  const trendEnd = range.fullMonths.length
    ? range.fullMonths[range.fullMonths.length - 1]
    : addMonthKey(monthKeyOf(range.end), -1) > lastFullMonth
      ? lastFullMonth
      : addMonthKey(monthKeyOf(range.end), -1);
  const trendKeys = [5, 4, 3, 2, 1, 0].map((n) => addMonthKey(trendEnd, -n));
  if (trendKeys.every(isTracked)) {
    for (const catId of firstMonthByCat.keys()) {
      if (isTransferCategory(catId)) continue;
      const values = trendKeys.map((k) => catSpendInMonth(catId, k));
      if (values.filter((v) => v > 0).length < 5) continue;
      const tau = kendallTau(values);
      const { slope, meanY, r2 } = linearFit(values);
      const fittedChange = slope * (values.length - 1);
      if (Math.abs(tau) < 0.6 || r2 < 0.5 || Math.abs(fittedChange) < Math.max(50, meanY * 0.25)) continue;
      const first = values[0];
      const last = values[values.length - 1];
      const steps = values.slice(1).filter((v, i) => (tau > 0 ? v > values[i] : v < values[i])).length;
      const change = pctChange(last, first);
      const rising = tau > 0;
      findings.push({
        id: `trend:${catId}`,
        label: "Trend",
        title: `${catName(catId)} is ${rising ? "climbing" : "easing"}`,
        basis: "statistical",
        direction: rising ? "up" : "down",
        impact: Math.abs(fittedChange) * Math.abs(tau),
        parts: [
          `${catName(catId)} went from `,
          money(first, catHref(catId, monthStartIso(trendKeys[0]), monthEndIso(trendKeys[0]))),
          ` in ${monthLabel(trendKeys[0], "long", false)} to `,
          money(last, catHref(catId, monthStartIso(trendEnd), monthEndIso(trendEnd))),
          ` in ${monthLabel(trendEnd, "long", false)}`,
          change !== null ? ` — ${rising ? "up" : "down"} ${Math.abs(Math.round(change))}% over 6 months, ` : ", ",
          `${rising ? "rising" : "falling"} in ${steps} of 5 month-to-month steps.`,
        ],
        series: trendKeys.map((k, i) => ({
          label: monthLabel(k, "short", false),
          value: values[i],
          href: catHref(catId, monthStartIso(k), monthEndIso(k)),
        })),
      });
    }
  }

  // Unusual vs baseline — statistical: robust z-score (median/MAD) against
  // the category's own tracked months before this range.
  if (range.fullMonths.length > 0) {
    const baselineKeys = trackedFullMonthsBefore(monthKeyOf(range.start), 12);
    for (const [catId, firstKey] of firstMonthByCat) {
      if (isTransferCategory(catId)) continue;
      const baseline = baselineKeys.filter((k) => k >= firstKey).map((k) => catSpendInMonth(catId, k));
      if (baseline.length < 6) continue;
      const perMonth = range.fullMonths.reduce((s, k) => s + catSpendInMonth(catId, k), 0) / range.fullMonths.length;
      const sorted = [...baseline].sort((a, b) => a - b);
      const median = quantile(sorted, 0.5);
      // A category that's usually $0 has no "usual level" to be unusual
      // against — a single purchase would always look extreme.
      if (median < 25) continue;
      const mad = quantile([...baseline.map((v) => Math.abs(v - median))].sort((a, b) => a - b), 0.5);
      const scale = Math.max(1.4826 * mad, median * 0.15, 25);
      const z = (perMonth - median) / scale;
      const diff = perMonth - median;
      if (Math.abs(z) < 3 || Math.abs(diff) < 75) continue;
      const fullStart = monthStartIso(range.fullMonths[0]);
      const fullEnd = monthEndIso(range.fullMonths[range.fullMonths.length - 1]);
      const baseStart = monthStartIso(baselineKeys.filter((k) => k >= firstKey)[0]);
      const baseEnd = monthEndIso(baselineKeys[baselineKeys.length - 1]);
      const single = range.fullMonths.length === 1;
      findings.push({
        id: `unusual:${catId}`,
        label: "Unusual",
        title: `${catName(catId)} is ${diff > 0 ? "above" : "below"} its usual level`,
        basis: "statistical",
        direction: diff > 0 ? "up" : "down",
        impact: Math.abs(diff) * Math.min(Math.abs(z) / 3, 2),
        parts: [
          `${catName(catId)} ${single ? "came to" : "averaged"} `,
          money(perMonth, catHref(catId, fullStart, fullEnd)),
          single ? ` in ${monthLabel(range.fullMonths[0], "long")}` : " a month in this range",
          `, against a typical `,
          money(median, catHref(catId, baseStart, baseEnd)),
          ` a month over your previous ${baseline.length} months.`,
        ],
      });
    }
  }

  // Price change — threshold: a charge that held one price for its last 3
  // charges, now at a different one (≥5% and ≥$1).
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[0-9#*]+/g, " ").replace(/[^a-z& ]/g, " ").replace(/\s+/g, " ").trim();
  const chargeGroups = new Map<string, Transaction[]>();
  for (const t of spendTxns) {
    const key = normalize(t.description);
    if (key.length < 3) continue;
    chargeGroups.set(key, [...(chargeGroups.get(key) ?? []), t]);
  }
  for (const group of chargeGroups.values()) {
    if (group.length < 4) continue;
    const sorted = [...group].sort((a, b) => a.txn_date.localeCompare(b.txn_date));
    const latest = sorted[sorted.length - 1];
    if (latest.txn_date < range.start || latest.txn_date > range.end) continue;
    const previous = sorted.slice(-4, -1);
    const prevPrice = Number(previous[0].amount);
    if (!previous.every((t) => Math.abs(Number(t.amount) - prevPrice) < 0.005)) continue;
    if (new Set(previous.map((t) => monthKeyOf(t.txn_date))).size < 3) continue;
    const diff = Number(latest.amount) - prevPrice;
    if (Math.abs(diff) < Math.max(1, prevPrice * 0.05)) continue;
    const q = latest.description;
    findings.push({
      id: `price:${normalize(q)}`,
      label: "Price change",
      title: `${q} changed price`,
      basis: "threshold",
      direction: diff > 0 ? "up" : "down",
      impact: Math.abs(diff) * 12,
      parts: [
        `${q} charged `,
        money(Number(latest.amount), txHref({ q, start: latest.txn_date, end: latest.txn_date })),
        ` on ${formatDate(latest.txn_date)}, after `,
        money(prevPrice, txHref({ q, start: previous[0].txn_date, end: previous[2].txn_date })),
        ` for each of the previous 3 charges (${diff > 0 ? "+" : "−"}${Math.abs(Math.round((diff / prevPrice) * 100))}%).`,
      ],
    });
  }

  // Gone quiet — threshold: regular spending in 4+ of the 6 months before
  // this range, and nothing in it.
  if (range.fullMonths.length > 0) {
    const priorKeys = [6, 5, 4, 3, 2, 1].map((n) => addMonthKey(monthKeyOf(range.start), -n));
    if (priorKeys.every(isTracked)) {
      const priorStart = monthStartIso(priorKeys[0]);
      const priorEnd = monthEndIso(priorKeys[5]);
      for (const catId of firstMonthByCat.keys()) {
        if (isTransferCategory(catId)) continue;
        const monthsWithSpend = priorKeys.filter((k) => catSpendInMonth(catId, k) > 0).length;
        if (monthsWithSpend < 4 || (rangeCatTotals.get(catId) ?? 0) > 0) continue;
        const priorTotal = priorKeys.reduce((s, k) => s + catSpendInMonth(catId, k), 0);
        findings.push({
          id: `quiet:${catId}`,
          label: "Gone quiet",
          title: `No ${catName(catId)} spending`,
          basis: "threshold",
          direction: "down",
          impact: (priorTotal / 6) * Math.min(range.fullMonths.length, 3),
          parts: [
            `Nothing was spent on ${catName(catId)} in this range, after spending in ${monthsWithSpend} of the previous 6 months (`,
            money(priorTotal, catHref(catId, priorStart, priorEnd)),
            ` in total).`,
          ],
        });
      }
    }
  }

  // Budget pace — projection: this month's spend-to-date extended to month
  // end, once at least 7 days of the month have passed.
  const dayOfMonth = Number(todayIso.slice(8, 10));
  const daysInThisMonth = Number(monthEndIso(thisMonth).slice(8, 10));
  const plannedThisMonth = [...(plannedByMonthCat.get(thisMonth)?.values() ?? [])].reduce((s, v) => s + v, 0);
  if (range.partial && dayOfMonth >= 7 && dayOfMonth < daysInThisMonth && plannedThisMonth > 0) {
    const toDate = spendBetween(monthStartIso(thisMonth), todayIso);
    const projected = (toDate / dayOfMonth) * daysInThisMonth;
    const gap = projected - plannedThisMonth;
    if (Math.abs(gap) >= Math.max(100, plannedThisMonth * 0.1)) {
      findings.push({
        id: `pace:${thisMonth}`,
        label: "On pace",
        title: gap > 0 ? "Spending is running ahead of the budget" : "Spending is running under the budget",
        basis: "projection",
        direction: gap > 0 ? "up" : "down",
        impact: Math.abs(gap) * 0.8,
        parts: [
          `${monthLabel(thisMonth, "long", false)} spending so far is `,
          money(toDate, txHref({ start: monthStartIso(thisMonth), end: todayIso, flow: "out" })),
          ` after ${dayOfMonth} days. At that pace the month would end near ${formatMoney(Math.round(projected))}, against ${formatMoney(plannedThisMonth)} planned.`,
        ],
      });
    }
  }

  // Goal pace — projection: a dated goal's linked account at its recent
  // contribution rate, compared with the goal's end date. It's about where
  // things are headed from today, so it only appears for ranges running up
  // to today — not for a past window like "last 6 months".
  for (const o of range.partial ? objectives : []) {
    if (!o.end_date || !o.linked_account_id || o.status === "Achieved") continue;
    const item = goalItems.find((g) => g.id === o.linked_account_id);
    if (!item || item.monthlyAdded === null || item.current >= item.target) continue;
    const endKey = monthKeyOf(o.end_date);
    const monthsLeft = monthKeysBetween(thisMonth, endKey).length - 1;
    if (monthsLeft < 1) continue;
    const projected = item.current + item.monthlyAdded * monthsLeft;
    const short = item.target - projected;
    if (Math.abs(short) < Math.max(100, item.target * 0.05)) continue;
    findings.push({
      id: `goal:${o.id}`,
      label: "On pace",
      title: short > 0 ? `${o.name} is on pace to finish short` : `${o.name} is on pace to finish early`,
      basis: "projection",
      direction: short > 0 ? "down" : "up",
      impact: Math.abs(short) * 0.5,
      parts: [
        `At the recent pace of `,
        money(item.monthlyAdded, item.addedHref ?? item.href),
        ` a month, ${o.name} would be near ${formatMoney(Math.round(projected))} by ${formatDate(o.end_date)}, against a target of `,
        money(item.target, item.href),
        ".",
      ],
    });
  }

  findings.sort((a, b) => b.impact - a.impact);
  const topFindings = findings.slice(0, MAX_FINDINGS);

  const headline: InsightsData["headline"] = topFindings[0]
    ? { kind: "finding", id: topFindings[0].id }
    : history.status === "ok" && history.pct !== null && Math.abs(history.pct) >= 10
      ? { kind: "card", id: "history" }
      : { kind: "card", id: "where" };

  return {
    range,
    rangeText: rangeText(range.start, range.end),
    trackingStartLabel,
    cashflow,
    where,
    history,
    budget,
    goals,
    recurring: recurringCard,
    findings: topFindings,
    headline,
  };
}
