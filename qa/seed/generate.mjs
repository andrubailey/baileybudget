#!/usr/bin/env node
// Realistic-use seed dataset for Bailey Budget QA — NOT demo data.
//
// Two years of both people logging, long bank-style merchant strings, heavy
// and near-empty categories, months with gaps, duplicate-looking entries, a
// refund on checking AND one on a credit card, a $0 transaction, amounts over
// $10,000, splits, soft deletes, backdated entries, month-boundary/timezone
// edges, and rows with no attribution (the AI Advisor incident pattern).
//
// Deterministic: the same --seed and --as-of always produce byte-identical
// output, so regression tests can pin exact IDs and totals.
//
//   node seed/generate.mjs                       # as-of today, scale 1
//   node seed/generate.mjs --scale=5             # 5x routine volume (perf)
//   node seed/generate.mjs --as-of=2026-09-30    # pin the "today" it builds up to
//   node seed/generate.mjs --out=.data/seed.json
//
// Output: { meta, users, tables } — consumed by mock-supabase/server.mjs.
// Never load this into the real Supabase project; it's fake household data.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TEST_USERS } from "../mock-supabase/test-users.mjs";

const here = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = {};
  for (const a of argv) {
    const m = a.match(/^--([a-z-]+)(?:=(.*))?$/);
    if (m) args[m[1]] = m[2] ?? "true";
  }
  return args;
}

function localTodayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const args = parseArgs(process.argv.slice(2));
const SEED = args.seed ?? "bailey";
const AS_OF = args["as-of"] ?? localTodayIso();
const SCALE = Math.max(1, Number(args.scale ?? 1));
const OUT = resolve(here, "..", args.out ?? ".data/seed.json");

// ---------------------------------------------------------------------------
// Deterministic randomness + ids
// ---------------------------------------------------------------------------

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a) {
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let rng;
// A separate stream for ids, so adding a row somewhere doesn't reshuffle
// every amount generated after it.
let idRng;
function reseed() {
  rng = mulberry32(hashString(`${SEED}|${AS_OF}`));
  idRng = mulberry32(hashString(`${SEED}|ids`));
}

function uuid() {
  const b = Array.from({ length: 16 }, () => Math.floor(idRng() * 256));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const chance = (p) => rng() < p;
const pick = (arr) => arr[Math.floor(rng() * arr.length)];
const between = (min, max) => min + rng() * (max - min);
const cents = (n) => Math.round(n * 100) / 100;
const money = (min, max) => cents(between(min, max));

// ---------------------------------------------------------------------------
// Dates. Everything is a plain "YYYY-MM-DD" in UTC math, like the app itself.
// created_at is modeled in America/New_York local time (the household's) so
// late-evening entries land on the next UTC day — the timezone edge.
// ---------------------------------------------------------------------------

const DAY = 86400000;
const parseIso = (iso) => new Date(`${iso}T00:00:00Z`);
const toIso = (d) => d.toISOString().slice(0, 10);
const addDays = (iso, n) => toIso(new Date(parseIso(iso).getTime() + n * DAY));
const monthKey = (iso) => iso.slice(0, 7);
const lastDayOfMonth = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

// US DST, at day granularity: second Sunday of March up to the first Sunday
// of November is EDT (UTC-4), otherwise EST (UTC-5).
function nyOffsetHours(iso) {
  const d = parseIso(iso);
  const y = d.getUTCFullYear();
  const firstSunday = (month) => 1 + ((7 - new Date(Date.UTC(y, month, 1)).getUTCDay()) % 7);
  const dstStart = Date.UTC(y, 2, firstSunday(2) + 7);
  const dstEnd = Date.UTC(y, 10, firstSunday(10));
  return d.getTime() >= dstStart && d.getTime() < dstEnd ? 4 : 5;
}

function localToUtc(iso, hour, minute) {
  const offset = nyOffsetHours(iso);
  return new Date(parseIso(iso).getTime() + (hour + offset) * 3600000 + minute * 60000).toISOString();
}

const asOf = parseIso(AS_OF);
const startIso = toIso(new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - 24, 1)));

// ---------------------------------------------------------------------------
// Users (fake identities on the mock auth server only)
// ---------------------------------------------------------------------------

// Everything below is rebuilt from a fresh random stream per call, so a
// scaled run can calibrate itself (see the bottom of the file).
function build(passes) {
reseed();
const ANDRU = TEST_USERS.andru;
const GERALYN = TEST_USERS.geralyn;

// ---------------------------------------------------------------------------
// Periods: one per month from startIso through the as-of month.
// ---------------------------------------------------------------------------

const periods = [];
const periodByMonth = new Map();
{
  let y = parseIso(startIso).getUTCFullYear();
  let m = parseIso(startIso).getUTCMonth();
  while (Date.UTC(y, m, 1) <= Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), 1)) {
    const start = toIso(new Date(Date.UTC(y, m, 1)));
    const end = toIso(new Date(Date.UTC(y, m, lastDayOfMonth(y, m))));
    const name = new Date(Date.UTC(y, m, 1)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
    const p = {
      id: uuid(),
      name,
      start_date: start,
      end_date: end,
      created_at: localToUtc(start, 7, 12),
      budget_locked_at: null,
      budget_locked_by_email: null,
      budget_lock_snapshot: null,
    };
    periods.push(p);
    periodByMonth.set(monthKey(start), p);
    m += 1;
    if (m === 12) {
      m = 0;
      y += 1;
    }
  }
}
const currentPeriod = periods[periods.length - 1];

// ---------------------------------------------------------------------------
// Accounts — the same *shape* as the real household (personal + business,
// sinking funds, a card, a loan) with no real names, balances or numbers.
// ---------------------------------------------------------------------------

function account(fields) {
  return {
    id: uuid(),
    goal: null,
    is_active: true,
    bank: null,
    sort_order: 0,
    is_debt: false,
    low_balance_alert: null,
    account_type: "checking",
    login_url: null,
    logo_url: null,
    is_business: false,
    created_at: localToUtc(startIso, 9, 0),
    balance_checked_at: null,
    ...fields,
  };
}

const A = {
  personalChecking: account({ name: "Personal Checking", bank: "Chase", starting_balance: 4212.55, low_balance_alert: 1500, sort_order: 1 }),
  businessChecking: account({ name: "Business Checking", bank: "Chase for Business", starting_balance: 11840.12, is_business: true, sort_order: 2 }),
  businessSavings: account({ name: "Business Savings", bank: "Chase for Business", account_type: "savings", starting_balance: 6000, is_business: true, sort_order: 3 }),
  taxSavings: account({ name: "Tax Savings", bank: "CIT Bank", account_type: "savings", starting_balance: 9500, is_business: true, sort_order: 4 }),
  emergencyFund: account({ name: "Emergency Fund", bank: "CIT Bank", account_type: "savings", starting_balance: 8200, goal: 15000, low_balance_alert: 5000, sort_order: 5 }),
  carFund: account({ name: "Car Maintenance Fund", bank: "Chase", account_type: "savings", starting_balance: 1150, goal: 3000, sort_order: 6 }),
  // Long name on purpose — card rows are where truncation bites.
  amex: account({ name: "Delta SkyMiles Blue Cash Everyday Amex", bank: "Amex", account_type: "credit_card", starting_balance: 1843.27, goal: 0, is_debt: true, sort_order: 7 }),
  // Closed card: inactive, but its history still has to add up.
  oldCard: account({ name: "Chase Freedom (closed)", bank: "Chase", account_type: "credit_card", starting_balance: 612.4, goal: 0, is_debt: true, is_active: false, sort_order: 8 }),
  carLoan: account({ name: "Car Loan", account_type: "loan", starting_balance: 18400, goal: 0, is_debt: true, sort_order: 9 }),
  // Deliberately sits below its low-balance alert, so that warning has data.
  cash: account({ name: "Cash", account_type: "cash", starting_balance: 140, low_balance_alert: 250, sort_order: 10 }),
};
A.personalChecking.balance_checked_at = localToUtc(addDays(AS_OF, -3), 20, 14);

// Running balances, using the app's own formula (getAccountsWithBalances):
// income adds and expense subtracts on any account; a transfer subtracts
// from a normal account / adds to a debt one on the "from" side, and the
// reverse on the "to" side. Lets card payments pay the real balance and
// sweeps keep checking realistic, instead of tuned constants drifting.
const debtIds = new Set(Object.values(A).filter((a) => a.is_debt).map((a) => a.id));
const bal = new Map(Object.values(A).map((a) => [a.id, a.starting_balance]));
function applyBalance(row) {
  const add = (id, amt) => bal.set(id, cents(bal.get(id) + amt));
  if (row.kind === "transfer") {
    if (row.account_id) add(row.account_id, (debtIds.has(row.account_id) ? 1 : -1) * row.amount);
    if (row.to_account_id) add(row.to_account_id, (debtIds.has(row.to_account_id) ? -1 : 1) * row.amount);
  } else if (row.account_id) {
    add(row.account_id, (row.kind === "income" ? 1 : -1) * row.amount);
  }
}

// ---------------------------------------------------------------------------
// Categories — heavy, sparse, never-used, and deactivated ones.
// ---------------------------------------------------------------------------

function category(name, kind, group_name, extra = {}) {
  return {
    id: uuid(),
    name,
    kind,
    is_need: false,
    icon: null,
    rollover: false,
    group_name,
    is_active: true,
    created_at: localToUtc(startIso, 9, 5),
    ...extra,
  };
}

const C = {
  // Housing
  rent: category("Rent", "expense", "Housing", { is_need: true, is_active: false }), // moved out
  mortgage: category("Mortgage", "expense", "Housing", { is_need: true }),
  homeMaintenance: category("Home Maintenance", "expense", "Housing", { rollover: true }),
  electric: category("Electric", "expense", "Utilities", { is_need: true }),
  water: category("Water & Sewer", "expense", "Utilities", { is_need: true }),
  internet: category("Internet", "expense", "Utilities", { is_need: true }),
  phone: category("Phone", "expense", "Utilities", { is_need: true }),
  // Food (heavy)
  groceries: category("Groceries", "expense", "Food", { is_need: true }),
  dining: category("Dining Out", "expense", "Food"),
  coffee: category("Coffee", "expense", "Food"),
  // Transportation
  gas: category("Gas", "expense", "Transportation", { is_need: true }),
  carMaintenance: category("Car Maintenance", "expense", "Transportation"),
  carInsurance: category("Car Insurance", "expense", "Transportation", { is_need: true }),
  carPayment: category("Car Payment", "expense", "Transportation", { is_need: true }),
  // Kids
  childcare: category("Childcare", "expense", "Kids", { is_need: true }),
  kidsActivities: category("Kids Activities", "expense", "Kids"),
  school: category("School Supplies & Fees", "expense", "Kids"),
  // Personal
  clothing: category("Clothing", "expense", "Personal"),
  haircuts: category("Haircuts", "expense", "Personal"),
  health: category("Health & Medical", "expense", "Personal", { is_need: true }),
  household: category("Household Supplies", "expense", "Personal"),
  // Giving
  tithe: category("Tithe", "expense", "Giving"),
  gifts: category("Gifts", "expense", "Giving"),
  // Subscriptions & fun
  streaming: category("Streaming", "expense", "Subscriptions"),
  software: category("Apps & Software", "expense", "Subscriptions"),
  entertainment: category("Entertainment", "expense", "Fun"),
  travel: category("Travel", "expense", "Fun"),
  // Business
  bizSoftware: category("Business Software", "expense", "Business"),
  contractors: category("Contractors", "expense", "Business"),
  bizMeals: category("Business Meals", "expense", "Business"),
  taxes: category("Estimated Taxes", "expense", "Business"),
  // Almost none / none
  petInsurance: category("Pet Insurance", "expense", "Personal"), // one charge in two years
  postage: category("Postage & Shipping", "expense", null), // two charges, never budgeted
  donationsOther: category("Donations - Other", "expense", "Giving"), // budgeted, never spent
  // Income
  salary: category("Salary", "income", null),
  businessRevenue: category("Business Revenue", "income", null),
  refunds: category("Refunds & Reimbursements", "income", null),
  interest: category("Interest", "income", null),
  giftsReceived: category("Gifts Received", "income", null),
};

// ---------------------------------------------------------------------------
// Merchant strings — the way bank feeds actually spell them.
// ---------------------------------------------------------------------------

const M = {
  groceries: [
    "PUBLIX #1523 BUFORD GA",
    "KROGER #0412",
    "WHOLEFDS ALP 10317 ALPHARETTA GA",
    "COSTCO WHSE #1063",
    "TRADER JOE'S #744 QPS",
    "ALDI 72060 SUWANEE GA",
    "INSTACART*PUBLIX SUPER MARKETS INC SAN FRANCISCO CA",
  ],
  dining: [
    "CHICK-FIL-A #03921",
    "TST* LA PARRILLA MEXICAN RESTAURANT - BUFORD",
    "DOORDASH*CHIPOTLE MEXICAN GRILL 855-973-1040 CA",
    "OUTBACK 4414",
    "SQ *THE HUDDLE HOUSE OF NORTHEAST GEORGIA LLC",
    "PANERA BREAD #601208 K",
    "UBER   *EATS PENDING HELP.UBER.COM CA",
  ],
  coffee: ["STARBUCKS STORE 23714", "SQ *THE COFFEE ROASTERS OF NORTHERN GEORGIA LLC", "DUNKIN #351488 Q35"],
  gas: ["QT 1287 OUTSIDE", "SHELL OIL 57444209102", "RACETRAC #2294", "COSTCO GAS #1063"],
  amazon: [
    "AMZN Mktp US*2K4HD8Q12 AMZN.COM/BILLWA",
    "Amazon.com*RT7Y21KD0 Amzn.com/billWA",
    "AMAZON MKTPL*ZH5PP0UN3 Amzn.com/billWA",
  ],
  clothing: ["TARGET        00017889", "OLD NAVY US 5892", "KOHL'S #1417", "NORDSTROM RACK #0592"],
  kids: [
    "GWINNETT COUNTY PARKS & REC YOUTH ATHLETICS REGISTRATION",
    "SQ *HARMONY MUSIC ACADEMY OF BUFORD",
    "KIDS KORNER LEARNING CTR",
  ],
  streaming: ["NETFLIX.COM", "Disney Plus 888-9057888 CA", "SPOTIFY USA", "YouTubePremium g.co/helppay#"],
  software: ["APPLE.COM/BILL 866-712-7753 CA", "GOOGLE *Google One g.co/helppay#"],
  bizSoftware: ["FIGMA", "ADOBE  *CREATIVE CLOUD 800-833-6687 CA", "NOTION LABS, INC.", "FRAMER B.V. AMSTERDAM"],
  contractors: ["PAYPAL *UPWORK GLOBAL", "WISE US INC INV-TRANSFER", "ZELLE TO MARIA ALEXANDRA RODRIGUEZ-FITZGERALD"],
};

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

const transactions = [];
const splits = [];
const history = [];
const notesPool = [
  null, null, null, null, null, null,
  "split with the Hendersons",
  "reimbursable — client dinner",
  "birthday present for Mom",
  "returned one item, see refund",
  "Imported from Chase statement history — matched by amount and posting date; original description preserved above.",
];

function who() {
  // Roughly 60/40, and the split shifts by category below.
  return chance(0.6) ? ANDRU : GERALYN;
}

function addTxn({ kind, description, amount, date, account, to = null, category = null, by = who(), notes = null, lagDays = 0, hour, minute, periodOverride, extra = {} }) {
  const period = periodOverride ?? periodByMonth.get(monthKey(date));
  if (!period) return null;
  const createdDate = addDays(date, lagDays);
  const h = hour ?? Math.floor(between(7, 23));
  const created_at = localToUtc(createdDate, h, minute ?? Math.floor(between(0, 59)));
  const ageDays = (asOf.getTime() - parseIso(date).getTime()) / DAY;
  const row = {
    id: uuid(),
    kind,
    description,
    amount,
    txn_date: date,
    account_id: account ? account.id : null,
    to_account_id: to ? to.id : null,
    category_id: category ? category.id : null,
    period_id: period.id,
    notes,
    cleared: ageDays > 6 || chance(0.3),
    pending_approval: false,
    deleted_at: null,
    created_by: by ? by.id : null,
    created_by_email: by ? by.email : null,
    recurring_transaction_id: null,
    receipt_url: null,
    created_at,
    updated_at: created_at,
    ...extra,
  };
  transactions.push(row);
  return row;
}

// Spending on a card is stored the app's way: kind "income" on the debt
// account (quick-add flips it, see effectiveKind in quick-add.tsx).
function spend({ description, amount, date, category, onCard = false, by, notes, lagDays, hour, extra }) {
  return addTxn({
    kind: onCard ? "income" : "expense",
    description,
    amount,
    date,
    account: onCard ? A.amex : A.personalChecking,
    category,
    by,
    // An explicit null means "no note"; only an omitted note gets a random one.
    notes: notes === undefined ? pick(notesPool) : notes,
    lagDays,
    hour,
    extra,
  });
}

// ---------------------------------------------------------------------------
// Recurring rules (and the transactions they generated)
// ---------------------------------------------------------------------------

function rule(fields) {
  return { id: uuid(), is_active: true, created_at: localToUtc(startIso, 10, 0), deleted_at: null, ...fields };
}

const moveInIso = addDays(AS_OF, -107); // the house purchase, ~3.5 months ago
const R = {
  rent: rule({ kind: "expense", description: "BILT RENT PAYMENT - OAKWOOD RESIDENTIAL", amount: 2150, account_id: A.personalChecking.id, category_id: C.rent.id, day_of_month: 1, is_active: false }),
  mortgage: rule({ kind: "expense", description: "PINEWOOD HOME LOANS MTG PYMT", amount: 2659.5, account_id: A.personalChecking.id, category_id: C.mortgage.id, day_of_month: 1, created_at: localToUtc(moveInIso, 10, 0) }),
  internet: rule({ kind: "expense", description: "COMCAST CABLE COMMUNICATIONS 800-266-2278", amount: 89.99, account_id: A.personalChecking.id, category_id: C.internet.id, day_of_month: 15 }),
  phone: rule({ kind: "expense", description: "VERIZON WRLS P2P ONLINE PMT", amount: 164.32, account_id: A.personalChecking.id, category_id: C.phone.id, day_of_month: 22 }),
  carInsurance: rule({ kind: "expense", description: "STATE FARM INSURANCE AUTO", amount: 212.18, account_id: A.personalChecking.id, category_id: C.carInsurance.id, day_of_month: 12 }),
  carPayment: rule({ kind: "expense", description: "TOYOTA FINANCIAL SERVICES AUTO PAY", amount: 486.44, account_id: A.personalChecking.id, category_id: C.carPayment.id, day_of_month: 18 }),
  netflix: rule({ kind: "expense", description: "NETFLIX.COM", amount: 17.99, account_id: A.personalChecking.id, category_id: C.streaming.id, day_of_month: 5 }),
  salary1: rule({ kind: "income", description: "GWINNETT CO PUBLIC SCHOOLS DIR DEP PAYROLL", amount: 2154.66, account_id: A.personalChecking.id, category_id: C.salary.id, day_of_month: 1 }),
  salary2: rule({ kind: "income", description: "GWINNETT CO PUBLIC SCHOOLS DIR DEP PAYROLL", amount: 2154.66, account_id: A.personalChecking.id, category_id: C.salary.id, day_of_month: 15 }),
  // Deleted rule whose past transactions must still count.
  gym: rule({ kind: "expense", description: "PLANET FITNESS CLUB FEES", amount: 24.99, account_id: A.personalChecking.id, category_id: C.health.id, day_of_month: 17, deleted_at: localToUtc(addDays(startIso, 200), 12, 0), is_active: false }),
};
const recurringRules = Object.values(R);

// ---------------------------------------------------------------------------
// The day-by-day walk
// ---------------------------------------------------------------------------

// Life events that shape the data.
const vacationStart = addDays(startIso, 300); // ~19-day trip with no logging
const vacationEnd = addDays(vacationStart, 19);
const quietMonth = monthKey(addDays(startIso, 150)); // fell off tracking; ~6 entries logged

const quietMonthCounter = { count: 0 };

function isQuiet(date) {
  if (date >= vacationStart && date < vacationEnd) return true;
  if (monthKey(date) === quietMonth) {
    quietMonthCounter.count += 1;
    return quietMonthCounter.count % 7 !== 0; // log ~1 in 7 routine purchases
  }
  return false;
}

function postRecurring(r, date, overrides = {}) {
  const account = Object.values(A).find((a) => a.id === r.account_id);
  const category = Object.values(C).find((c) => c.id === r.category_id);
  return addTxn({
    kind: r.kind,
    description: r.description,
    amount: overrides.amount ?? r.amount,
    date,
    account,
    category,
    by: overrides.by ?? ANDRU,
    notes: null,
    hour: 6,
    minute: 2,
    extra: { recurring_transaction_id: r.id },
  });
}

for (let date = startIso; date <= AS_OF; date = addDays(date, 1)) {
  const d = parseIso(date);
  const dom = d.getUTCDate();
  const dow = d.getUTCDay();
  const inHouse = date >= moveInIso;

  // --- Recurring bills and paychecks (always posted, even on vacation) ---
  if (dom === 1 && !inHouse) postRecurring(R.rent, date);
  if (dom === 1 && inHouse) postRecurring(R.mortgage, date);
  if (dom === 15) postRecurring(R.internet, date);
  if (dom === 22) postRecurring(R.phone, date, { amount: cents(R.phone.amount + (chance(0.3) ? money(-12, 18) : 0)) });
  if (dom === 12) postRecurring(R.carInsurance, date);
  if (dom === 18) postRecurring(R.carPayment, date);
  if (dom === 5) postRecurring(R.netflix, date, { amount: date >= addDays(startIso, 400) ? 22.99 : 17.99 }); // price hike
  if (dom === 1 || dom === 15) postRecurring(dom === 1 ? R.salary1 : R.salary2, date, { by: GERALYN });
  if (dom === 17 && date < addDays(startIso, 200)) postRecurring(R.gym, date);

  // Car loan payment as a transfer into the debt account.
  if (dom === 18) {
    addTxn({ kind: "transfer", description: "Car loan principal", amount: 312.9, date, account: A.personalChecking, to: A.carLoan, by: ANDRU, hour: 6, minute: 5 });
  }

  // Utilities with seasonal swing.
  if (dom === 9) {
    const month = d.getUTCMonth();
    const summer = month >= 5 && month <= 8;
    const winter = month === 11 || month <= 1;
    spend({ description: "GEORGIA POWER BILL PAYMENT 888-660-5890", amount: money(summer ? 210 : winter ? 170 : 110, summer ? 340 : winter ? 260 : 160), date, category: C.electric, by: ANDRU, notes: null });
  }
  if (dom === 20) spend({ description: "GWINNETT COUNTY DWR WATER UTILITY", amount: money(48, 96), date, category: C.water, by: ANDRU, notes: null });

  // --- Business money flows (Andru) ---
  const revenueDays = [3, 11, 19, 26];
  if (revenueDays.includes(dom) && chance(0.6)) {
    const big = chance(0.06);
    addTxn({
      kind: "income",
      description: pick(["STRIPE TRANSFER ST-K3J9Q2", "ACH CREDIT NORTHSTAR HOLDINGS LLC INV 2291", "WIRE IN FIGMA INC PAYMENT REF 0000891273"]),
      amount: big ? money(10200, 18500) : money(1000, 7000),
      date,
      account: A.businessChecking,
      category: C.businessRevenue,
      by: ANDRU,
    });
  }
  if (dom === 28) {
    addTxn({ kind: "transfer", description: "Owner draw", amount: Math.round(money(5500, 8000) / 25) * 25, date, account: A.businessChecking, to: A.personalChecking, by: ANDRU });
    addTxn({ kind: "transfer", description: "Set aside for taxes", amount: money(1200, 2400), date, account: A.businessChecking, to: A.taxSavings, by: ANDRU });
  }
  if (dom === 6) addTxn({ kind: "expense", description: pick(M.bizSoftware), amount: money(15, 89), date, account: A.businessChecking, category: C.bizSoftware, by: ANDRU });
  if (dom === 14 && chance(0.55)) addTxn({ kind: "expense", description: pick(M.contractors), amount: money(400, 3800), date, account: A.businessChecking, category: C.contractors, by: ANDRU });
  // Quarterly estimated taxes from Tax Savings — one of them over $10k.
  if (dom === 15 && [0, 3, 5, 8].includes(d.getUTCMonth())) {
    const bigQuarter = monthKey(date) === monthKey(addDays(startIso, 470));
    addTxn({ kind: "expense", description: "IRS USATAXPYMT 1040-ES", amount: bigQuarter ? 15250 : money(3800, 7200), date, account: A.taxSavings, category: C.taxes, by: ANDRU, hour: 8 });
  }

  // --- Savings transfers — the $75 same-day-different-account pattern ---
  if (dom === 16) {
    addTxn({ kind: "transfer", description: "Emergency fund", amount: 250, date, account: A.personalChecking, to: A.emergencyFund, by: GERALYN, hour: 7, minute: 30 });
    addTxn({ kind: "transfer", description: "Car maintenance fund", amount: 75, date, account: A.personalChecking, to: A.carFund, by: GERALYN, hour: 7, minute: 31 });
    if (chance(0.5)) addTxn({ kind: "transfer", description: "Business savings top-up", amount: 75, date, account: A.businessChecking, to: A.businessSavings, by: ANDRU, hour: 9, minute: 2 });
  }
  if (dom === 25) addTxn({ kind: "income", description: "INTEREST PAYMENT", amount: money(3.1, 38.9), date, account: A.emergencyFund, category: C.interest, by: null, hour: 3 });

  // --- Tithe: follows income, not a fixed amount ---
  if (dow === 0 && chance(0.85)) {
    spend({ description: "PUSHPAY*NORTH POINT COMMUNITY CHURCH", amount: cents(money(180, 290) / 10) * 10, date, category: C.tithe, by: GERALYN, notes: null });
  }

  // --- Routine discretionary spending (scaled; skipped when quiet) ---
  for (let pass = 0; pass < passes; pass++) {
    if (isQuiet(date)) continue;
    const onCard = () => chance(0.42);
    if (chance(0.3)) spend({ description: pick(M.groceries), amount: money(38, 265), date, category: C.groceries, onCard: onCard(), by: chance(0.65) ? GERALYN : ANDRU });
    if (chance(0.38)) spend({ description: pick(M.dining), amount: money(9.5, 142), date, category: C.dining, onCard: onCard() });
    if (chance(0.5)) spend({ description: pick(M.coffee), amount: money(3.95, 11.4), date, category: C.coffee, onCard: onCard(), by: chance(0.7) ? ANDRU : GERALYN, notes: null });
    if (dow === pass % 7 || chance(0.08)) spend({ description: pick(M.gas), amount: money(34, 79), date, category: C.gas, onCard: onCard() });
    if (chance(0.22)) {
      const cat = pick([C.household, C.household, C.clothing, C.kidsActivities, C.school, C.gifts, C.entertainment]);
      spend({ description: pick(M.amazon), amount: money(8.49, 189.99), date, category: cat, onCard: true });
    }
    if (chance(0.05)) spend({ description: pick(M.clothing), amount: money(18, 160), date, category: C.clothing, onCard: onCard(), by: GERALYN });
    if (dow === 2 && pass === 0) spend({ description: M.kids[1], amount: 35, date, category: C.kidsActivities, by: GERALYN, notes: null });
    if (chance(0.035)) spend({ description: pick(["CVS/PHARMACY #07234", "PIEDMONT HEALTHCARE COPAY", "NORTHSIDE PEDIATRICS"]), amount: money(15, 240), date, category: C.health });
    if (chance(0.03)) spend({ description: pick(["GREAT CLIPS #4410", "SQ *FADE FACTORY BARBERSHOP"]), amount: money(19, 55), date, category: C.haircuts, by: ANDRU });
    if (chance(0.015)) spend({ description: pick(["THE HOME DEPOT #0167", "LOWE'S #1845"]), amount: money(24, 480), date, category: C.homeMaintenance, onCard: onCard(), by: ANDRU });
    if (chance(0.012)) spend({ description: pick(["AMC 7118 ONLINE", "REGAL CINEMAS MALL OF GA 20", "TICKETMASTER *CONCERT"]), amount: money(18, 210), date, category: C.entertainment, onCard: true });
    if (dow === 5 && chance(0.25)) spend({ description: pick(M.dining), amount: money(40, 180), date, category: C.bizMeals, onCard: true, by: ANDRU, notes: "reimbursable — client dinner" });
    if (dom === 1 && pass === 0) spend({ description: M.kids[2], amount: 640, date, category: C.childcare, by: GERALYN, notes: null });
    if (dom === 3 && pass === 0 && chance(0.6)) spend({ description: pick(M.software), amount: pick([2.99, 9.99, 14.99]), date, category: C.software, onCard: true, notes: null });
    if (dom === 8 && pass === 0) spend({ description: pick(M.streaming), amount: pick([7.99, 13.99, 11.99]), date, category: C.streaming, onCard: true, notes: null });
  }

  // December gifts spike.
  if (d.getUTCMonth() === 11 && dom >= 5 && dom <= 22 && chance(0.55)) {
    spend({ description: pick([...M.amazon, "TARGET        00017889", "BARNES & NOBLE #2785"]), amount: money(12, 240), date, category: C.gifts, onCard: true });
  }
}

// Catch-up burst after the vacation: many entries logged days later.
{
  let d = vacationStart;
  let i = 0;
  while (d < vacationEnd) {
    if (i % 2 === 0) {
      spend({ description: pick([...M.dining, "MARRIOTT SAVANNAH RIVERFRONT", "SHELL OIL 57444209102"]), amount: money(14, 260), date: d, category: pick([C.travel, C.dining, C.gas]), onCard: true, lagDays: Math.round(parseIso(vacationEnd).getTime() / DAY - parseIso(d).getTime() / DAY) + 1, by: GERALYN, notes: "logged after the trip" });
    }
    d = addDays(d, 1);
    i += 1;
  }
}

// ---------------------------------------------------------------------------
// One-off edge cases (never scaled)
// ---------------------------------------------------------------------------

const edge = {};
const iso = (daysFromStart) => addDays(startIso, daysFromStart);
const recent = (daysAgo) => addDays(AS_OF, -daysAgo);

// Big travel purchase and a car repair.
edge.travel = spend({ description: "DELTA AIR LINES 0062334819922 ATLANTA GA", amount: 4850.4, date: iso(410), category: C.travel, onCard: true, by: ANDRU, notes: "Italy trip — 4 tickets" });
edge.carRepair = spend({ description: "FIRESTONE COMPLETE AUTO CARE #017532", amount: 1286.12, date: iso(520), category: C.carMaintenance, onCard: true, by: ANDRU });
// Over $10k: roof paid from the emergency fund.
edge.roof = addTxn({ kind: "expense", description: "ATLANTA ROOFING SPECIALISTS INC DEPOSIT", amount: 11750, date: iso(560), account: A.emergencyFund, category: C.homeMaintenance, by: ANDRU, notes: "new roof — insurance covered the rest" });

// Refund to checking (income, Refunds category) and on the card (expense on
// the debt account — which the app's totals then ignore; worth checking).
edge.refundChecking = addTxn({ kind: "income", description: "AMZN Mktp US refund 2K4HD8Q12", amount: 89.99, date: recent(40), account: A.personalChecking, category: C.refunds, by: GERALYN, notes: "returned one item, see refund" });
edge.refundCard = addTxn({ kind: "expense", description: "COSTCO WHSE #1063 RETURN CREDIT", amount: 146.23, date: recent(12), account: A.amex, category: C.groceries, by: GERALYN, notes: "returned the air fryer" });

// $0 transaction (free trial "charge").
edge.zero = spend({ description: "APPLE.COM/BILL TRIAL 866-712-7753 CA", amount: 0, date: recent(9), category: C.software, onCard: true, by: ANDRU, notes: null });

// Duplicate-looking: two legit identical lunches, then a genuine
// both-of-us-logged-it duplicate a few minutes apart.
edge.lunchA = spend({ description: "CHICK-FIL-A #03921", amount: 14.38, date: recent(6), category: C.dining, by: ANDRU, hour: 12, notes: null });
edge.lunchB = spend({ description: "CHICK-FIL-A #03921", amount: 14.38, date: recent(6), category: C.dining, by: ANDRU, hour: 18, notes: null });
edge.dupeFirst = spend({ description: "PUBLIX #1523 BUFORD GA", amount: 132.47, date: recent(4), category: C.groceries, by: GERALYN, hour: 19, minute: 2, notes: null });
edge.dupeSecond = spend({ description: "Publix", amount: 132.47, date: recent(4), category: C.groceries, by: ANDRU, hour: 19, minute: 9, notes: null });

// Uncategorized spending — every real household has some waiting to be
// sorted (it's what the "needs a category" banner exists for).
edge.uncategorized1 = spend({ description: "VENMO PAYMENT 1043528812", amount: 60, date: recent(8), category: null, by: GERALYN, notes: null });
edge.uncategorized2 = spend({ description: "CHECK #1187", amount: 215, date: recent(14), category: null, by: ANDRU, notes: null });

// Pet insurance: one charge in two years. Postage: two, never budgeted.
edge.pet = spend({ description: "TRUPANION PET INSURANCE 855-266-7919", amount: 58.14, date: iso(333), category: C.petInsurance, by: GERALYN });
spend({ description: "USPS PO 1234560401", amount: 12.4, date: iso(95), category: C.postage, by: ANDRU, notes: null });
spend({ description: "THE UPS STORE #6012", amount: 31.87, date: recent(20), category: C.postage, by: ANDRU, notes: null });

// A Costco run split across three categories (parent has no category).
edge.split = addTxn({ kind: "expense", description: "COSTCO WHSE #1063", amount: 312.84, date: recent(3), account: A.personalChecking, category: null, by: GERALYN, notes: null });
for (const [cat, amt] of [[C.groceries, 188.2], [C.household, 94.15], [C.clothing, 30.49]]) {
  splits.push({ id: uuid(), transaction_id: edge.split.id, category_id: cat.id, amount: amt, created_at: edge.split.created_at });
}

// Month-boundary + timezone: bought at 11:40pm on the last day of last
// month (created_at lands on the 1st in UTC), and a backdated late entry
// dated last month but filed under the current period.
{
  const lastMonthEnd = addDays(currentPeriod.start_date, -1);
  edge.boundary = spend({ description: "WAFFLE HOUSE #1782", amount: 23.61, date: lastMonthEnd, category: C.dining, by: ANDRU, hour: 23, minute: 40, notes: null });
  edge.backdated = spend({ description: "SQ *HARMONY MUSIC ACADEMY OF BUFORD", amount: 140, date: addDays(lastMonthEnd, -2), category: C.kidsActivities, by: GERALYN, lagDays: 5, notes: "forgot to log — recital fee", extra: {} });
  if (edge.backdated) edge.backdated.period_id = currentPeriod.id;
  edge.firstOfMonth = spend({ description: "KROGER #0412", amount: 61.09, date: currentPeriod.start_date, category: C.groceries, by: GERALYN, hour: 0, minute: 15, notes: null });
}

// Float traps: three 10-cent charges (0.1 + 0.2 != 0.3) and a 3-decimal
// amount such as the Shortcuts API could accept.
for (let i = 0; i < 3; i++) spend({ description: "PARKMOBILE CONVENIENCE FEE", amount: 0.1, date: recent(2), category: C.entertainment, by: ANDRU, notes: null });
edge.threeDecimals = spend({ description: "SHORTCUT: coffee split three ways", amount: 33.333, date: recent(1), category: C.coffee, by: ANDRU, notes: "QA: 3-decimal amount (Shortcuts API accepts arbitrary numerics)" });

// Pending approval (current month) and uncleared recent ones.
edge.pending1 = spend({ description: "POTTERY BARN KIDS #0921 — bunk beds", amount: 1899, date: recent(1), category: C.household, by: GERALYN, notes: "want to check with you first", extra: { pending_approval: true, cleared: false } });
edge.pending2 = spend({ description: "APPLE STORE R396 LENOX SQUARE", amount: 1249, date: AS_OF, category: C.software, onCard: true, by: ANDRU, notes: "new laptop? ok?", extra: { pending_approval: true, cleared: false } });

// Rows with no attribution (the AI Advisor bulk-insert pattern), clustered
// in one minute.
for (let i = 0; i < 6; i++) {
  const row = spend({ description: pick(M.groceries), amount: money(20, 120), date: recent(10 + i), category: C.groceries, by: null, notes: null, lagDays: 10 + i - 2 });
  if (row) {
    row.created_at = localToUtc(recent(2), 6, 32 + (i % 3));
    row.created_by = ANDRU.id;
    row.created_by_email = null;
  }
}

// Soft-deleted rows (must never show or count).
for (let i = 0; i < 4; i++) {
  const row = spend({ description: pick(M.dining), amount: money(10, 60), date: recent(5 + i * 9), category: C.dining });
  if (row) row.deleted_at = localToUtc(recent(4 + i * 9), 21, 3);
}

// Old closed card history.
for (let i = 0; i < 18; i++) {
  addTxn({ kind: "income", description: pick([...M.dining, ...M.gas]), amount: money(9, 95), date: iso(5 + i * 6), account: A.oldCard, category: pick([C.dining, C.gas]), by: ANDRU, notes: null });
}
// Paid off to exactly $0 before it was closed.
{
  const owed = transactions
    .filter((t) => t.account_id === A.oldCard.id && t.kind === "income")
    .reduce((sum, t) => cents(sum + t.amount), A.oldCard.starting_balance);
  addTxn({ kind: "transfer", description: "CHASE CREDIT CRD AUTOPAY", amount: owed, date: iso(5 + 18 * 6), account: A.personalChecking, to: A.oldCard, by: ANDRU });
}

// Cash: a few, including an ATM withdrawal transfer.
addTxn({ kind: "transfer", description: "ATM WITHDRAWAL 000123 BUFORD GA", amount: 100, date: recent(30), account: A.personalChecking, to: A.cash, by: ANDRU });
addTxn({ kind: "expense", description: "Farmers market", amount: 34, date: recent(28), account: A.cash, category: C.groceries, by: GERALYN, notes: null });

// Edited transactions with history (and a newer updated_at).
for (const row of [edge.dupeSecond, edge.lunchB, edge.carRepair].filter(Boolean)) {
  const before = { ...row, description: row.description.toUpperCase() === row.description ? `${row.description} ` : row.description.toUpperCase(), amount: cents(row.amount + 1) };
  const editedAt = new Date(new Date(row.created_at).getTime() + 3600000).toISOString();
  history.push({ id: uuid(), transaction_id: row.id, edited_by_email: row.created_by_email === ANDRU.email ? GERALYN.email : ANDRU.email, edited_at: editedAt, snapshot: before });
  row.updated_at = editedAt;
}

// ---------------------------------------------------------------------------
// Cash management, in date order over everything generated above: pay the
// card in full on the 24th, sweep month-end excess into savings, and top up
// checking before it goes meaningfully negative. Done last rather than
// inline because the one-off purchases above are dated in the past (inline
// payments would never cover them), and because at --scale spending
// multiplies while paychecks don't.
// ---------------------------------------------------------------------------

{
  const byDate = new Map();
  for (const t of transactions) {
    if (t.deleted_at) continue;
    if (!byDate.has(t.txn_date)) byDate.set(t.txn_date, []);
    byDate.get(t.txn_date).push(t);
  }
  const move = (date, description, amount, from, to, by, hour) => {
    if (!(amount > 0)) return;
    const row = addTxn({ kind: "transfer", description, amount: cents(amount), date, account: from, to, by, hour, minute: 5 });
    if (row) applyBalance(row);
  };
  for (let date = startIso; date <= AS_OF; date = addDays(date, 1)) {
    for (const t of byDate.get(date) ?? []) applyBalance(t);
    const d = parseIso(date);
    const dom = d.getUTCDate();
    if (dom === 24) move(date, "AMEX EPAYMENT ACH PMT", bal.get(A.amex.id), A.personalChecking, A.amex, ANDRU, 6);
    if (dom === Math.min(29, lastDayOfMonth(d.getUTCFullYear(), d.getUTCMonth()))) {
      const toEf = Math.floor(Math.min(bal.get(A.personalChecking.id) - 8000, A.emergencyFund.goal - bal.get(A.emergencyFund.id)) / 50) * 50;
      if (toEf >= 500) move(date, "Sweep to emergency fund", toEf, A.personalChecking, A.emergencyFund, GERALYN, 21);
      const bizExcess = Math.floor((bal.get(A.businessChecking.id) - 30000) / 100) * 100;
      if (bizExcess >= 2000) move(date, "Sweep to business savings", bizExcess, A.businessChecking, A.businessSavings, ANDRU, 21);
    }
    if (bal.get(A.personalChecking.id) < 1500) {
      move(date, "Transfer from business checking", Math.ceil((3000 - bal.get(A.personalChecking.id)) / 500) * 500, A.businessChecking, A.personalChecking, ANDRU, 22);
    }
    if (bal.get(A.businessChecking.id) < 5000) {
      const need = Math.ceil((10000 - bal.get(A.businessChecking.id)) / 1000) * 1000;
      const fromSavings = Math.min(need, Math.max(0, Math.floor(bal.get(A.businessSavings.id) / 100) * 100));
      move(date, "Transfer from business savings", fromSavings, A.businessSavings, A.businessChecking, ANDRU, 22);
      if (fromSavings < need) {
        // Out of cushion entirely — a big client month. In practice only at
        // --scale, where spending multiplies but income doesn't.
        const row = addTxn({ kind: "income", description: "WIRE IN CLIENT RETAINER REF 0000554120", amount: need - fromSavings, date, account: A.businessChecking, category: C.businessRevenue, by: ANDRU, hour: 22, minute: 30 });
        if (row) applyBalance(row);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Budget lines — most categories budgeted most months, with holes.
// ---------------------------------------------------------------------------

const typical = new Map([
  [C.rent, 2150], [C.mortgage, 2660], [C.homeMaintenance, 150], [C.electric, 190], [C.water, 75],
  [C.internet, 90], [C.phone, 165], [C.groceries, 1150], [C.dining, 450], [C.coffee, 90],
  [C.gas, 260], [C.carMaintenance, 75], [C.carInsurance, 215], [C.carPayment, 490], [C.childcare, 640],
  [C.kidsActivities, 180], [C.school, 40], [C.clothing, 120], [C.haircuts, 60], [C.health, 120],
  [C.household, 200], [C.tithe, 950], [C.gifts, 75], [C.streaming, 45], [C.software, 20],
  [C.entertainment, 80], [C.travel, 150], [C.bizSoftware, 180], [C.contractors, 1500], [C.bizMeals, 120],
  [C.donationsOther, 25], [C.petInsurance, 0],
]);

const budgetLines = [];
for (const p of periods) {
  const housed = p.end_date >= moveInIso;
  for (const [cat, base] of typical) {
    if (cat === C.rent && housed) continue;
    if (cat === C.mortgage && !housed) continue;
    if (base === 0) continue;
    // Holes: a few categories go unbudgeted in some months.
    if ((cat === C.gifts || cat === C.travel || cat === C.school) && chance(0.35)) continue;
    // December gift budget spike.
    const planned = cat === C.gifts && p.start_date.slice(5, 7) === "12" ? 900 : Math.max(5, Math.round((base * between(0.9, 1.12)) / 5) * 5);
    budgetLines.push({ id: uuid(), category_id: cat.id, period_id: p.id, planned_amount: planned, created_at: p.created_at });
  }
}

// Last month's plan was locked, then one line was edited afterward.
{
  const lastMonth = periods[periods.length - 2];
  const lines = budgetLines.filter((b) => b.period_id === lastMonth.id);
  lastMonth.budget_locked_at = localToUtc(addDays(lastMonth.start_date, 3), 21, 10);
  lastMonth.budget_locked_by_email = GERALYN.email;
  lastMonth.budget_lock_snapshot = lines.map((b) => ({ category_id: b.category_id, planned_amount: b.planned_amount }));
  const dining = lines.find((b) => b.category_id === C.dining.id);
  if (dining) dining.planned_amount += 150;
}

// ---------------------------------------------------------------------------
// Objectives, loan, calendar, profiles
// ---------------------------------------------------------------------------

const objectives = [
  { id: uuid(), name: "Fully funded emergency fund", status: "In Progress", start_date: startIso, end_date: addDays(AS_OF, 240), notes: null, linked_account_id: A.emergencyFund.id, image_url: null, created_at: localToUtc(startIso, 12, 0), deleted_at: null },
  { id: uuid(), name: "Pay off the car loan early", status: "In Progress", start_date: iso(60), end_date: addDays(AS_OF, 540), notes: "extra $100/mo when business has a good month", linked_account_id: A.carLoan.id, image_url: null, created_at: localToUtc(iso(60), 12, 0), deleted_at: null },
  { id: uuid(), name: "Italy with the kids — summer after next, the long version with the Amalfi coast and a week in Florence", status: "Not Started", start_date: null, end_date: addDays(AS_OF, 620), notes: null, linked_account_id: null, image_url: null, created_at: localToUtc(iso(200), 12, 0), deleted_at: null },
  { id: uuid(), name: "New roof", status: "Achieved", start_date: iso(400), end_date: iso(560), notes: null, linked_account_id: null, image_url: null, created_at: localToUtc(iso(400), 12, 0), deleted_at: null },
  { id: uuid(), name: "Deleted goal (should never show)", status: "Not Started", start_date: null, end_date: null, notes: null, linked_account_id: null, image_url: null, created_at: localToUtc(iso(100), 12, 0), deleted_at: localToUtc(iso(101), 12, 0) },
];

const loans = [
  {
    id: uuid(),
    name: "Mortgage",
    lender: "Pinewood Home Loans",
    property_address: "100 Example Ridge Dr, Testville, GA 30000",
    borrowers: "Andru (test), Geralyn (test)",
    loan_number_last4: "0000",
    interest_rate: 5.125,
    original_balance: 361000,
    first_payment_date: addDays(moveInIso, 45),
    maturity_date: addDays(moveInIso, 45 + 365 * 30),
    principal_balance: 359880.44,
    balance_as_of: addDays(AS_OF, -8),
    next_payment_due: toIso(new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() + 1, 1))),
    escrow_balance: 1216.6,
    monthly_payment: 2659.5,
    payment_match: "pinewood home loans",
    payment_category_id: C.mortgage.id,
    login_url: null,
    estimated_home_value: 455000,
    purchase_date: moveInIso,
    created_at: localToUtc(moveInIso, 12, 0),
  },
];

function nextWeekday(fromIso, weekday) {
  let d = fromIso;
  while (parseIso(d).getUTCDay() !== weekday) d = addDays(d, 1);
  return d;
}

const calendarEvents = [];
function event(fields) {
  calendarEvents.push({ id: uuid(), start_time: null, end_time: null, notes: null, recurrence: "none", assignee: null, created_by: ANDRU.id, created_by_email: ANDRU.email, deleted_at: null, created_at: localToUtc(recent(20), 20, 0), ...fields });
}
event({ title: "Piano lesson", event_date: nextWeekday(iso(420), 2), start_time: "16:30:00", end_time: "17:15:00", recurrence: "weekly", assignee: "kids", created_by: GERALYN.id, created_by_email: GERALYN.email });
event({ title: "Soccer practice", event_date: nextWeekday(recent(60), 4), start_time: "17:30:00", end_time: "19:00:00", recurrence: "weekly", assignee: "kids" });
event({ title: "Dentist", event_date: addDays(AS_OF, 2), start_time: "08:15:00", end_time: "09:00:00", assignee: "geralyn", created_by: GERALYN.id, created_by_email: GERALYN.email });
event({ title: "HOA board meeting — bring the landscaping bids and the pool resurfacing quote", event_date: addDays(AS_OF, 5), start_time: "19:00:00", assignee: "andru" });
event({ title: "School picture day", event_date: addDays(AS_OF, 3), assignee: "kids", created_by: GERALYN.id, created_by_email: GERALYN.email });
event({ title: "Date night", event_date: addDays(AS_OF, 4), start_time: "19:30:00", end_time: "22:00:00", assignee: "family" });
event({ title: "Thanksgiving at Grandma's", event_date: addDays(AS_OF, 58), assignee: "family" });
// Four events on one day — exercises "+N more" in the month grid.
for (const [title, t] of [["Oil change", "08:00:00"], ["Client call", "10:30:00"], ["Pick up dry cleaning", null], ["Book club", "19:00:00"]]) {
  event({ title, event_date: addDays(AS_OF, 1), start_time: t });
}
event({ title: "No assignee, no time", event_date: addDays(AS_OF, 6) });
event({ title: "Bad data: ends before it starts", event_date: addDays(AS_OF, 7), start_time: "15:00:00", end_time: "14:00:00", assignee: "andru" });
event({ title: "Deleted event (should never show)", event_date: addDays(AS_OF, 1), deleted_at: localToUtc(recent(1), 9, 0) });

const profiles = [
  { id: ANDRU.id, display_name: "Andru", avatar_url: null, updated_at: localToUtc(startIso, 9, 0), insights_prefs: null },
  { id: GERALYN.id, display_name: "Geralyn", avatar_url: null, updated_at: localToUtc(startIso, 9, 0), insights_prefs: null },
];

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

transactions.sort((a, b) => (a.txn_date === b.txn_date ? a.created_at.localeCompare(b.created_at) : a.txn_date.localeCompare(b.txn_date)));

const tables = {
  accounts: Object.values(A),
  periods,
  categories: Object.values(C),
  budget_lines: budgetLines,
  recurring_transactions: recurringRules,
  transactions,
  transaction_splits: splits,
  transaction_history: history,
  objectives,
  api_tokens: [],
  profiles,
  loans,
  calendar_events: calendarEvents,
};

const edgeIds = Object.fromEntries(Object.entries(edge).filter(([, v]) => v).map(([k, v]) => [k, v.id]));

const meta = {
  generated_by: "qa/seed/generate.mjs",
  seed: SEED,
  as_of: AS_OF,
  scale: SCALE,
  routine_passes: passes,
  range: { start: startIso, end: AS_OF },
  counts: Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length])),
  live_transactions: transactions.filter((t) => !t.deleted_at).length,
  // Stable handles on the deliberate edge cases, for regression tests.
  edge_ids: edgeIds,
  account_ids: Object.fromEntries(Object.entries(A).map(([k, v]) => [k, v.id])),
  category_ids: Object.fromEntries(Object.entries(C).map(([k, v]) => [k, v.id])),
  vacation_gap: { start: vacationStart, end: vacationEnd },
  quiet_month: quietMonth,
};

return { tables, meta };
}

// --scale means total live transaction volume, not "more of just the
// discretionary spending": bills, paychecks and transfers don't multiply,
// so calibrate how many routine passes it takes to reach N x the 1x volume.
let result = build(1);
if (SCALE > 1) {
  const base = result.meta.live_transactions;
  const perPass = build(2).meta.live_transactions - base;
  const fixed = base - perPass;
  const passes = Math.max(1, Math.round((SCALE * base - fixed) / perPass));
  result = build(passes);
  result.meta.volume_vs_1x = Math.round((result.meta.live_transactions / base) * 100) / 100;
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(
  OUT,
  `${JSON.stringify({ meta: result.meta, users: Object.values(TEST_USERS).map((u) => ({ id: u.id, email: u.email, display_name: u.display_name })), tables: result.tables }, null, 1)}\n`,
);
console.log(`Wrote ${OUT}`);
console.log(
  `  as-of ${AS_OF}, scale ${SCALE} (${result.meta.routine_passes} routine passes${result.meta.volume_vs_1x ? `, ${result.meta.volume_vs_1x}x volume` : ""}), ${result.tables.periods.length} periods, ${result.meta.live_transactions} live transactions`,
);
