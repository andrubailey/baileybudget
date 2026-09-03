export type Account = {
  id: string;
  name: string;
  starting_balance: number;
  goal: number | null;
  is_active: boolean;
  bank: string | null;
  created_at: string;
};

export const BANK_OPTIONS = ["Chase", "CIT Bank", "Amex"] as const;

export type Period = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  created_at: string;
};

// Expense categories belong to one period (e.g. "Groceries" in September and
// "Groceries" in October are separate rows, each with their own planned
// amount). Income categories are shared across periods, so period_id is null.
export type Category = {
  id: string;
  name: string;
  kind: "income" | "expense";
  period_id: string | null;
  planned_amount: number;
  is_need: boolean;
  created_at: string;
};

export type Transaction = {
  id: string;
  kind: "income" | "expense";
  description: string;
  amount: number;
  txn_date: string;
  account_id: string | null;
  category_id: string | null;
  period_id: string;
  tags: string[];
  created_by: string | null;
  created_at: string;
};

export const TAG_OPTIONS = [
  "Personal",
  "Business",
  "Recurring",
  "Savings",
  "Pending",
] as const;
