// Amortization for a fixed-rate loan, anchored to a statement. Pure — no
// data access — so the numbers are easy to check by hand.
//
// The statement gives the principal owed after every payment dated on or
// before `balance_as_of`. Each matching payment logged after that date is
// split the way a servicer applies it: the escrow share first, then the
// month's interest on the running balance, and whatever is left comes off
// principal (so an extra-principal payment lowers the balance by more).

export type Loan = {
  id: string;
  name: string;
  lender: string | null;
  property_address: string | null;
  borrowers: string | null;
  loan_number_last4: string | null;
  interest_rate: number;
  original_balance: number;
  first_payment_date: string;
  maturity_date: string;
  principal_balance: number;
  balance_as_of: string;
  next_payment_due: string;
  escrow_balance: number | null;
  monthly_payment: number;
  payment_match: string | null;
  payment_category_id: string | null;
  // Absent until migration 024's login_url column exists.
  login_url?: string | null;
  // A manually-entered estimate (Zillow, an appraisal) — absent until
  // migration 027's estimated_home_value column exists, and null until
  // someone actually sets it from the mortgage card.
  estimated_home_value?: number | null;
  // When the house was actually bought — absent until migration 028's
  // purchase_date column exists. Distinct from first_payment_date (the
  // mortgage's first bill, which can land a month or more after closing).
  // Equity has nothing to do with Net Worth before this date.
  purchase_date?: string | null;
  created_at: string;
};

export type LoanPayment = {
  id: string;
  txn_date: string;
  amount: number;
  principal: number;
  interest: number;
  escrow: number;
};

export type LoanSummary = {
  loan: Loan;
  balance: number;
  // estimated_home_value minus balance — null (not zero) until a value has
  // been set, so a card can tell "no estimate yet" apart from "no equity."
  equity: number | null;
  termMonths: number;
  principalAndInterest: number;
  escrowPerMonth: number;
  paidPrincipal: number;
  paidOffPct: number;
  interestPaid: number;
  interestRemaining: number;
  paymentsRemaining: number;
  // "YYYY-MM-DD"
  payoffDate: string;
  nextDue: string;
  nextDueIsPast: boolean;
  nextPayment: { principal: number; interest: number; escrow: number };
  // Payments applied since the statement, newest first.
  payments: LoanPayment[];
};

type PaymentTxn = {
  id: string;
  kind: string;
  description: string;
  amount: number;
  txn_date: string;
  category_id: string | null;
  deleted_at?: string | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

function monthsBetween(fromIso: string, toIso: string) {
  const [fy, fm] = fromIso.split("-").map(Number);
  const [ty, tm] = toIso.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

export function addMonthsIso(iso: string, months: number) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + months, d)).toISOString().slice(0, 10);
}

export function isLoanPayment(loan: Loan, t: PaymentTxn) {
  if (t.kind !== "expense" || t.deleted_at) return false;
  if (loan.payment_category_id && t.category_id === loan.payment_category_id) return true;
  const match = loan.payment_match?.trim().toLowerCase();
  return !!match && t.description.toLowerCase().includes(match);
}

export function summarizeLoan(loan: Loan, transactions: PaymentTxn[], todayIso: string): LoanSummary {
  const rate = Number(loan.interest_rate) / 100 / 12;
  const original = Number(loan.original_balance);
  const termMonths = monthsBetween(loan.first_payment_date, loan.maturity_date) + 1;
  const principalAndInterest = round2(
    rate === 0 ? original / termMonths : (original * rate) / (1 - Math.pow(1 + rate, -termMonths)),
  );
  const escrowPerMonth = Math.max(0, round2(Number(loan.monthly_payment) - principalAndInterest));

  // Interest already paid by the statement date, from the original schedule.
  let interestPaid = 0;
  let scheduled = original;
  const paidAtStatement = Math.max(0, monthsBetween(loan.first_payment_date, loan.next_payment_due));
  for (let i = 0; i < paidAtStatement; i++) {
    const interest = round2(scheduled * rate);
    interestPaid += interest;
    scheduled -= principalAndInterest - interest;
  }

  let balance = Number(loan.principal_balance);
  const applied: LoanPayment[] = [];
  const payments = transactions
    .filter((t) => t.txn_date > loan.balance_as_of && isLoanPayment(loan, t))
    .sort((a, b) => a.txn_date.localeCompare(b.txn_date) || a.id.localeCompare(b.id));
  for (const t of payments) {
    const amount = Number(t.amount);
    const escrow = Math.min(escrowPerMonth, amount);
    const interest = Math.min(round2(balance * rate), round2(amount - escrow));
    const principal = Math.min(balance, Math.max(0, round2(amount - escrow - interest)));
    balance = round2(balance - principal);
    interestPaid += interest;
    applied.push({ id: t.id, txn_date: t.txn_date, amount, principal, interest, escrow });
  }

  // The rest of the schedule from today's balance at the regular payment.
  let remaining = balance;
  let interestRemaining = 0;
  let paymentsRemaining = 0;
  while (remaining > 0.005 && paymentsRemaining < 1200) {
    const interest = round2(remaining * rate);
    interestRemaining += interest;
    remaining = round2(remaining - Math.min(remaining, principalAndInterest - interest));
    // The cent-rounded payment leaves a few dollars over at the very end;
    // servicers fold that into the final payment rather than add a month.
    if (remaining < 50) remaining = 0;
    paymentsRemaining += 1;
  }

  const nextDue = addMonthsIso(loan.next_payment_due, applied.length);
  const nextInterest = round2(balance * rate);
  const paidPrincipal = round2(original - balance);

  const homeValue = loan.estimated_home_value;
  const equity = homeValue != null ? round2(Number(homeValue) - balance) : null;

  return {
    loan,
    balance,
    equity,
    termMonths,
    principalAndInterest,
    escrowPerMonth,
    paidPrincipal,
    paidOffPct: original > 0 ? (paidPrincipal / original) * 100 : 0,
    interestPaid: round2(interestPaid),
    interestRemaining: round2(interestRemaining),
    paymentsRemaining,
    payoffDate: addMonthsIso(nextDue, Math.max(0, paymentsRemaining - 1)),
    nextDue,
    nextDueIsPast: balance > 0 && nextDue < todayIso,
    nextPayment: {
      principal: Math.min(balance, round2(principalAndInterest - nextInterest)),
      interest: nextInterest,
      escrow: escrowPerMonth,
    },
    payments: applied.reverse(),
  };
}
