export type Account = {
  id: string;
  name: string;
  starting_balance: number;
  goal: number | null;
  is_active: boolean;
  bank: string | null;
  sort_order: number;
  // Debt accounts (loans, credit cards you're paying down) track payoff
  // progress toward `goal` (usually 0) instead of savings progress.
  is_debt: boolean;
  // Dashboard shows a warning banner when balance drops below this.
  low_balance_alert: number | null;
  // Purely descriptive — doesn't change balance math, just labeling/icons.
  account_type: AccountType | null;
  // Direct link to this account's bank login page — falls back to
  // BANK_LOGIN_URLS[bank] when unset.
  login_url: string | null;
  // Custom uploaded photo, shown instead of the bank-name badge/generic
  // icon when set.
  logo_url: string | null;
  // Groups the dashboard's Accounts card into Personal/Business instead of
  // by account_type.
  is_business: boolean;
  created_at: string;
  // Stamped by the mobile Accounts screen's reconcile action every time
  // someone confirms or corrects a balance against their real bank app —
  // null until the first reconcile. Not touched by ordinary transaction
  // entry, since logging a transaction isn't the same as checking a balance.
  balance_checked_at: string | null;
};

export const ACCOUNT_TYPES = [
  "checking",
  "savings",
  "credit_card",
  "loan",
  "cash",
  "investment",
  "other",
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  checking: "Checking",
  savings: "Savings",
  credit_card: "Credit card",
  loan: "Loan",
  cash: "Cash",
  investment: "Investment",
  other: "Other",
};

export const BANK_OPTIONS = [
  "Chase",
  "Chase for Business",
  "CIT Bank",
  "Amex",
] as const;

// Default login link per bank, used when an account doesn't set its own
// login_url. Editable per-account since some (like Chase) land on an
// account-specific dashboard URL rather than a generic login page.
export const BANK_LOGIN_URLS: Record<(typeof BANK_OPTIONS)[number], string> = {
  Chase: "https://secure.chase.com/web/auth/dashboard#/dashboard/summary/863809471/DDA/CHK",
  "Chase for Business": "https://secure.chase.com/web/auth/dashboard#/dashboard/summary/863809471/DDA/CHK",
  "CIT Bank": "https://secure.citbank.com/CITConsumer/#/Login",
  Amex: "https://www.americanexpress.com/en-us/account/login?inav=en_us_menu_login",
};

export type Period = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  created_at: string;
};

export type Category = {
  id: string;
  name: string;
  kind: "income" | "expense";
  is_need: boolean;
  // If true, an unspent (or overspent) amount carries into next period's
  // planned amount instead of resetting to whatever's typed in.
  rollover: boolean;
  // Freeform label for rolling up related categories (e.g. all "Food"
  // subcategories) in the dashboard and planning grid.
  group_name: string | null;
  // Manual override for the keyword-guessed icon in lib/category-icons.ts —
  // null falls back to the guess.
  icon: string | null;
  // Deactivated categories drop out of new-transaction pickers and the
  // Budgets page's default view, but their past data stays intact.
  is_active: boolean;
  created_at: string;
};

export type BudgetLine = {
  id: string;
  category_id: string;
  period_id: string;
  planned_amount: number;
  created_at: string;
};

export type RecurringTransaction = {
  id: string;
  kind: "income" | "expense";
  description: string;
  amount: number;
  account_id: string | null;
  category_id: string | null;
  day_of_month: number;
  is_active: boolean;
  created_at: string;
};

export type TransactionSplit = {
  id: string;
  transaction_id: string;
  category_id: string | null;
  amount: number;
  created_at: string;
};

// For kind='transfer', account_id is the "from" account and to_account_id is
// the "to" account; category_id is unused (transfers aren't income/expense).
export type Transaction = {
  id: string;
  kind: "income" | "expense" | "transfer";
  description: string;
  amount: number;
  txn_date: string;
  account_id: string | null;
  to_account_id: string | null;
  category_id: string | null;
  period_id: string;
  notes: string | null;
  cleared: boolean;
  // A planned purchase one spouse flagged for the other to see before/after
  // it happens — separate from `cleared`, which is about bank reconciliation.
  pending_approval: boolean;
  deleted_at: string | null;
  created_by: string | null;
  created_by_email: string | null;
  recurring_transaction_id: string | null;
  created_at: string;
};

export type Objective = {
  id: string;
  name: string;
  status: "Not Started" | "In Progress" | "On Hold" | "Achieved";
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  // When set, progress tracks this account's real balance against its goal
  // instead of being tracked manually.
  linked_account_id: string | null;
  // Background image for the featured-goal banner on the dashboard.
  image_url: string | null;
  created_at: string;
  deleted_at: string | null;
};

export type TransactionHistoryEntry = {
  id: string;
  transaction_id: string;
  edited_by_email: string | null;
  edited_at: string;
  snapshot: Record<string, unknown>;
};

export type Profile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  updated_at: string;
};

export const OBJECTIVE_STATUSES = [
  "Not Started",
  "In Progress",
  "On Hold",
  "Achieved",
] as const;
