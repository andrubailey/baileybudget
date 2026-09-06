export type Account = {
  id: string;
  name: string;
  starting_balance: number;
  goal: number | null;
  is_active: boolean;
  bank: string | null;
  sort_order: number;
  created_at: string;
};

export const BANK_OPTIONS = [
  "Chase",
  "Chase for Business",
  "CIT Bank",
  "Amex",
] as const;

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
  created_at: string;
};

export type BudgetLine = {
  id: string;
  category_id: string;
  period_id: string;
  planned_amount: number;
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
  tags: string[];
  notes: string | null;
  cleared: boolean;
  deleted_at: string | null;
  created_by: string | null;
  created_by_email: string | null;
  created_at: string;
};

export type Objective = {
  id: string;
  name: string;
  status: "Not Started" | "In Progress" | "On Hold" | "Achieved";
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  created_at: string;
};

export const OBJECTIVE_STATUSES = [
  "Not Started",
  "In Progress",
  "On Hold",
  "Achieved",
] as const;

export const TAG_OPTIONS = [
  "Personal",
  "Business",
  "Recurring",
  "Savings",
  "Pending",
] as const;
