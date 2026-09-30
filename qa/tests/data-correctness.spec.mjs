// Every calculated number vs. the sum of its parts, and the same fact vs.
// itself across screens. Expectations come from qa/lib/finance.mjs run over
// the QA mock's live tables — never from the app's own code.
//
// These assert CONSISTENCY ("September spending is one number everywhere"),
// not a particular definition — which definition is right is a design
// decision; that they disagree is the defect.
//
// Text extraction keys off visible labels. When the rebuild renames a label,
// update it here; the assertion stays the same.

import { amountAfter, balances, monthSpending, parseMoney, periodFor, rawAmountAfter, round2 } from "../lib/finance.mjs";
import { expect, mock, test } from "./helpers.mjs";

test.beforeEach(async ({}, testInfo) => {
  testInfo.skip(testInfo.project.name !== "large", "numbers don't depend on the device; run once, at the widest portrait size");
});

async function tables() {
  const names = ["accounts", "transactions", "transaction_splits", "periods", "loans", "calendar_events"];
  return Object.fromEntries(await Promise.all(names.map(async (n) => [n, await mock.table(n)])));
}

async function screenText(page, path) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  return page.evaluate(() => (document.querySelector("main") ?? document.body).innerText);
}

const asOf = async () => (await mock.state()).meta.as_of;

test("every account balance on the Accounts tab matches the ledger", async ({ page }) => {
  const t = await tables();
  const expected = balances(t);
  const text = await screenText(page, "/balances");
  const mismatches = [];
  for (const a of t.accounts.filter((x) => x.is_active)) {
    const shown = amountAfter(text, `\n${a.name}\n`) ?? amountAfter(text, a.name);
    const want = expected.get(a.id);
    // Debt accounts show the amount owed as a positive number under "Debt".
    if (shown === null || Math.abs(Math.abs(shown) - Math.abs(want)) > 0.005) mismatches.push(`${a.name}: shows ${shown}, ledger ${want}`);
  }
  expect(mismatches, mismatches.join("\n")).toEqual([]);
});

test("net worth = cash + home equity, and cash matches the ledger", async ({ page }) => {
  const t = await tables();
  const bal = balances(t);
  const cash = round2(t.accounts.filter((a) => a.is_active || bal.get(a.id) !== 0).reduce((s, a) => s + (a.is_debt ? -1 : 1) * bal.get(a.id), 0));
  const loan = t.loans[0];
  const equity = loan ? round2((loan.estimated_home_value ?? 0) - loan.principal_balance) : 0;
  const text = await screenText(page, "/");
  const shownCash = amountAfter(text, "Cash");
  const shownEquity = amountAfter(text, "Equity");
  const shownNetWorth = amountAfter(text, "Net Worth");
  expect(shownCash, "cash on the Overview vs. the ledger").toBeCloseTo(cash, 2);
  expect(shownEquity, "home equity vs. estimated value minus principal").toBeCloseTo(equity, 2);
  expect(shownNetWorth, "net worth vs. the cash + equity shown right beside it").toBeCloseTo(round2(shownCash + shownEquity), 2);
});

test("this month's spending is the same number everywhere it's shown", async ({ page }) => {
  const t = await tables();
  const period = periodFor(t, await asOf());
  const month = period.name.split(" ")[0];
  const ledger = monthSpending(t, period);

  const overview = await screenText(page, "/");
  const spending = await screenText(page, "/spending");
  const budget = await screenText(page, "/budget");

  const shown = {
    "Overview → Monthly Expenses": amountAfter(overview, "Monthly Expenses"),
    "Spending → Cash flow → Expenses": Math.abs(amountAfter(spending, "Expenses", { from: spending.indexOf("CASH FLOW") }) ?? NaN),
    [`Spending → Category breakdown → Spent in ${month}`]: amountAfter(spending, `Spent in ${month}`),
    "Budget tab → $X of $Y planned": parseMoney(budget.slice(budget.indexOf(period.name)).match(/\$[\d,.]+ of \$[\d,.]+ planned/)?.[0] ?? ""),
  };
  const values = Object.values(shown).map((v) => round2(v));
  const detail = [
    ...Object.entries(shown).map(([k, v]) => `  ${k}: ${v}`),
    `  ledger by transaction date: ${ledger.byDate}`,
    `  ledger by filed month (period): ${ledger.byPeriod}`,
    `  uncategorized in the month: ${ledger.uncategorizedByDate}`,
    `  filed under ${month} but dated outside it: ${ledger.filedUnderOtherMonth.join("; ") || "none"}`,
  ].join("\n");
  expect(new Set(values).size, `${month} spending disagrees with itself:\n${detail}`).toBe(1);
});

test("the Spending page states one over-budget figure, not two", async ({ page }) => {
  const text = await screenText(page, "/spending");
  // The first amount after the label is the "$X/day over pace" pill; the
  // hero figure is the first one that isn't a per-day rate.
  const afterLabel = text.slice(text.search(/left this month/i));
  const hero = afterLabel.match(/([-−]?)\$([\d,]+\.\d{2})(?!\/day)/);
  const heroLeft = hero ? (hero[1] ? -1 : 1) * Number(hero[2].replace(/,/g, "")) : null;
  const over = text.match(/\$([\d,]+\.\d{2}) over(?! pace)/);
  test.skip(heroLeft === null || heroLeft >= 0 || !over, "only meaningful when the month is over budget");
  expect(Math.abs(heroLeft), `hero says ${heroLeft} left; breakdown says $${over[1]} over`).toBeCloseTo(Number(over[1].replace(/,/g, "")), 2);
});

test("the Budget tab's headline is the sum of its rows", async ({ page }) => {
  const text = await screenText(page, "/budget");
  const head = text.match(/\$([\d,]+\.\d{2}) of \$([\d,]+\.\d{2}) planned/);
  const rows = [...text.slice(head.index + head[0].length).matchAll(/\n[^\n$]+\n\$([\d,]+\.\d{2}) of \$([\d,]+\.\d{2})/g)];
  const n = (s) => Number(s.replace(/,/g, ""));
  expect(round2(rows.reduce((s, r) => s + n(r[1]), 0)), "sum of category actuals").toBeCloseTo(n(head[1]), 2);
  expect(round2(rows.reduce((s, r) => s + n(r[2]), 0)), "sum of category plans").toBeCloseTo(n(head[2]), 2);
});

test("a card purchase is never shown as money coming in", async ({ page }) => {
  const t = await tables();
  const period = periodFor(t, await asOf());
  const card = t.accounts.find((a) => a.is_debt && a.account_type === "credit_card" && a.is_active);
  const purchase = t.transactions
    .filter((x) => !x.deleted_at && x.account_id === card.id && x.kind === "income" && x.category_id && x.txn_date >= period.start_date)
    .sort((a, b) => b.txn_date.localeCompare(a.txn_date))[0];
  const text = await screenText(page, "/recent");
  const shown = rawAmountAfter(text, purchase.description);
  expect(shown, `"${purchase.description}" ($${purchase.amount} on ${card.name}) is displayed as ${shown}`).not.toMatch(/^\+/);
});

test("same-day calendar events are listed in time order", async ({ page }) => {
  const text = await screenText(page, "/");
  const block = text.slice(text.indexOf("Calendar"));
  const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
  const items = [];
  for (let i = 1; i < lines.length; i++) {
    const m = lines[i].match(/^(Today|[A-Z][a-z]{2} \d{1,2}, \d{4})(?: · (\d{1,2}):(\d{2}) ([AP]M))?$/);
    if (m) items.push({ title: lines[i - 1], day: m[1], minutes: m[2] ? ((Number(m[2]) % 12) + (m[4] === "PM" ? 12 : 0)) * 60 + Number(m[3]) : -1 });
  }
  const outOfOrder = items.filter((it, i) => i > 0 && items[i - 1].day === it.day && items[i - 1].minutes > it.minutes);
  expect(outOfOrder.map((o) => `${o.day}: "${o.title}" listed after a later event`), items.map((i) => `${i.day} ${i.minutes} ${i.title}`).join("\n")).toEqual([]);
});

// DECISION NEEDED before this can be a real test: does a purchase flagged
// "needs approval" count as spent? Today it does, everywhere — the Budget
// tab's "Left to spend" includes proposals that haven't happened. Replace
// fixme with the chosen behavior once decided.
test("no amount anywhere shows float noise or more than two decimals", async ({ page }) => {
  const bad = [];
  for (const path of ["/", "/budget", "/balances", "/recent", "/spending", "/spending/budget", "/transactions", "/accounts"]) {
    const text = await screenText(page, path);
    for (const m of text.matchAll(/[-+]?\$\s?[\d,]*\.\d{3,}|\d\.\d*0000\d|\d\.\d*9999\d|NaN|Infinity/g)) bad.push(`${path}: "${m[0]}"`);
  }
  expect(bad).toEqual([]);
});

test.fixme("a purchase awaiting approval is either excluded from 'Left to spend' or visibly marked as pending there", async () => {});
