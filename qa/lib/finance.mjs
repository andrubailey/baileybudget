// An independent re-implementation of the app's documented money rules,
// computed straight from the QA mock's tables — the "sum of its parts" that
// every number on screen is checked against. Deliberately not imported from
// the app: agreeing with the app's own code proves nothing.
//
// Rules (from lib/queries.ts at the baseline):
//  - A debt account's balance is the amount OWED. A charge on it is stored
//    as kind "income" and counts as spending; a payment/refund on it is
//    stored as "expense" and counts as neither income nor spending.
//  - Transfers are never income or spending.
//  - Soft-deleted rows (deleted_at set) never count.

export const round2 = (n) => Math.round(n * 100) / 100;

export function debtIds(t) {
  return new Set(t.accounts.filter((a) => a.is_debt).map((a) => a.id));
}

export function reclassify(kind, accountId, debt) {
  if (kind !== "income" && kind !== "expense") return null;
  if (!(accountId && debt.has(accountId))) return kind;
  return kind === "income" ? "expense" : null;
}

export function balances(t) {
  const debt = debtIds(t);
  const out = new Map(t.accounts.map((a) => [a.id, a.starting_balance]));
  const add = (id, amt) => out.has(id) && out.set(id, out.get(id) + amt);
  for (const x of t.transactions) {
    if (x.deleted_at) continue;
    if (x.kind === "transfer") {
      if (x.account_id) add(x.account_id, (debt.has(x.account_id) ? 1 : -1) * x.amount);
      if (x.to_account_id) add(x.to_account_id, (debt.has(x.to_account_id) ? -1 : 1) * x.amount);
    } else if (x.account_id) {
      add(x.account_id, (x.kind === "income" ? 1 : -1) * x.amount);
    }
  }
  return new Map([...out].map(([id, v]) => [id, round2(v)]));
}

export function periodFor(t, iso) {
  return t.periods.find((p) => p.start_date <= iso && p.end_date >= iso) ?? null;
}

// Spending for a month two ways — by transaction date, or by the period a
// transaction was filed under. They differ exactly by late/backdated entries.
export function monthSpending(t, period) {
  const debt = debtIds(t);
  const live = t.transactions.filter((x) => !x.deleted_at && reclassify(x.kind, x.account_id, debt) === "expense");
  const byDate = live.filter((x) => x.txn_date >= period.start_date && x.txn_date <= period.end_date);
  const byPeriod = live.filter((x) => x.period_id === period.id);
  const sum = (rows) => round2(rows.reduce((s, x) => s + x.amount, 0));
  const splitParents = new Set(t.transaction_splits.map((s) => s.transaction_id));
  const uncategorized = (rows) => rows.filter((x) => !x.category_id && !splitParents.has(x.id));
  const pending = (rows) => rows.filter((x) => x.pending_approval);
  return {
    byDate: sum(byDate),
    byPeriod: sum(byPeriod),
    uncategorizedByDate: sum(uncategorized(byDate)),
    pendingByDate: sum(pending(byDate)),
    filedUnderOtherMonth: byPeriod.filter((x) => x.txn_date < period.start_date || x.txn_date > period.end_date).map((x) => `${x.description} ($${x.amount}, dated ${x.txn_date})`),
  };
}

// --- Reading numbers off a screen's text ---------------------------------

const MONEY = /([+-−]?)\$\s?([\d,]+(?:\.\d+)?)/;

export function parseMoney(s) {
  const m = String(s).match(MONEY);
  if (!m) return null;
  const v = Number(m[2].replace(/,/g, ""));
  return m[1] === "-" || m[1] === "−" ? -v : v;
}

// The first dollar amount after a label, e.g. amountAfter(text, "Monthly Expenses").
export function amountAfter(text, label, { from = 0 } = {}) {
  const i = text.indexOf(label, from);
  if (i === -1) return null;
  const m = text.slice(i + label.length).match(MONEY);
  return m ? parseMoney(m[0]) : null;
}

export function rawAmountAfter(text, label) {
  const i = text.indexOf(label);
  if (i === -1) return null;
  const m = text.slice(i + label.length).match(MONEY);
  return m ? m[0] : null;
}
