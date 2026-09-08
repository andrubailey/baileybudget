-- Personal Budgeting App schema
-- Run this once in the Supabase SQL editor (Project > SQL Editor > New query)
-- for a brand new project. This file is the canonical fresh-install shape —
-- kept in sync with the numbered migrations in this folder, which are only
-- needed to bring an already-live database up to the same state.

create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  starting_balance numeric not null default 0,
  goal numeric,
  is_active boolean not null default true,
  bank text,
  sort_order integer not null default 0,
  -- Debt accounts (loans, credit cards you're paying down) track payoff
  -- progress toward `goal` (usually 0) instead of savings progress.
  is_debt boolean not null default false,
  -- Dashboard shows a warning banner when balance drops below this.
  low_balance_alert numeric,
  -- Purely descriptive — doesn't change balance math, just labeling/icons.
  account_type text,
  -- Direct link to this account's bank login page — falls back to a
  -- per-bank default in lib/types.ts when unset.
  login_url text,
  created_at timestamptz not null default now()
);

create index if not exists accounts_sort_order_idx on accounts(sort_order);

create table if not exists periods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now()
);

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('income', 'expense')),
  is_need boolean not null default false,
  -- Manual override for the keyword-guessed icon in lib/category-icons.ts —
  -- null falls back to the guess.
  icon text,
  -- If true, an unspent (or overspent) amount carries into next period's
  -- planned amount instead of resetting to whatever's typed in.
  rollover boolean not null default false,
  -- Freeform label for rolling up related categories (e.g. all "Food"
  -- subcategories) in the dashboard and planning grid.
  group_name text,
  created_at timestamptz not null default now()
);

create table if not exists budget_lines (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references categories(id) on delete cascade,
  period_id uuid not null references periods(id) on delete cascade,
  planned_amount numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (category_id, period_id)
);

create index if not exists budget_lines_period_idx on budget_lines(period_id);

create table if not exists recurring_transactions (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('income', 'expense')),
  description text not null,
  amount numeric not null,
  account_id uuid references accounts(id) on delete set null,
  category_id uuid references categories(id) on delete set null,
  day_of_month integer not null check (day_of_month between 1 and 28),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- kind='transfer' moves money between two of the household's own accounts
-- (account_id -> to_account_id) without counting as income or expense.
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('income', 'expense', 'transfer')),
  description text not null,
  amount numeric not null,
  txn_date date not null default current_date,
  account_id uuid references accounts(id) on delete set null,
  to_account_id uuid references accounts(id) on delete set null,
  category_id uuid references categories(id) on delete set null,
  period_id uuid not null references periods(id) on delete cascade,
  created_by uuid references auth.users(id),
  created_by_email text,
  notes text,
  cleared boolean not null default false,
  deleted_at timestamptz,
  receipt_url text,
  -- Set when this transaction was auto-generated from a recurring entry, so
  -- generating a period's bills twice never double-creates them.
  recurring_transaction_id uuid references recurring_transactions(id) on delete set null,
  -- A planned purchase one spouse flagged for the other to see before/after
  -- it happens — separate from `cleared`, which is about bank reconciliation.
  pending_approval boolean not null default false,
  created_at timestamptz not null default now(),
  -- A transfer moves money between accounts, it isn't spend against a
  -- budget category, so it can never carry a category_id.
  constraint transactions_transfer_no_category check (kind <> 'transfer' or category_id is null)
);

create index if not exists transactions_period_idx on transactions(period_id);
create index if not exists transactions_account_idx on transactions(account_id);
create index if not exists transactions_to_account_idx on transactions(to_account_id);
create index if not exists transactions_category_idx on transactions(category_id);
create index if not exists transactions_deleted_at_idx on transactions(deleted_at);
create index if not exists transactions_txn_date_idx on transactions(txn_date);

-- A split transaction stores category_id: null on the parent row, plus one
-- row here per category/amount pair, so its spend is distributed across
-- categories in budget calculations.
create table if not exists transaction_splits (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  category_id uuid references categories(id) on delete set null,
  amount numeric not null,
  created_at timestamptz not null default now()
);

create index if not exists transaction_splits_transaction_idx on transaction_splits(transaction_id);

-- Snapshot of a transaction's fields right before an edit overwrites them,
-- so two people sharing this data can see what changed and who changed it.
create table if not exists transaction_history (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  edited_by_email text,
  edited_at timestamptz not null default now(),
  snapshot jsonb not null
);

create index if not exists transaction_history_transaction_idx on transaction_history(transaction_id);

create table if not exists objectives (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'Not Started'
    check (status in ('Not Started', 'In Progress', 'On Hold', 'Achieved')),
  start_date date,
  end_date date,
  notes text,
  -- When set, progress tracks this account's real balance against its goal
  -- instead of being tracked manually.
  linked_account_id uuid references accounts(id) on delete set null,
  -- Background image for the featured-goal banner on the dashboard.
  image_url text,
  created_at timestamptz not null default now()
);

-- Personal access tokens for the iOS Shortcuts integration (quick-add
-- expense/income/transfer without opening the app or logging in).
create table if not exists api_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  label text not null,
  created_by_email text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

-- Per-person display name + avatar, edited from the sidebar profile chip.
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  updated_at timestamptz not null default now()
);

-- Row Level Security: this is a 2-person shared household budget.
-- Any authenticated user (you + your wife) can read/write everything —
-- no per-user partitioning, since the whole point is shared data. profiles
-- is the one exception: both can read either profile, but each person can
-- only write their own row.

alter table accounts enable row level security;
alter table periods enable row level security;
alter table categories enable row level security;
alter table budget_lines enable row level security;
alter table recurring_transactions enable row level security;
alter table transactions enable row level security;
alter table transaction_splits enable row level security;
alter table transaction_history enable row level security;
alter table objectives enable row level security;
alter table api_tokens enable row level security;
alter table profiles enable row level security;

drop policy if exists "authenticated read accounts" on accounts;
drop policy if exists "authenticated write accounts" on accounts;
create policy "authenticated read accounts" on accounts for select to authenticated using (true);
create policy "authenticated write accounts" on accounts for all to authenticated using (true) with check (true);

drop policy if exists "authenticated read periods" on periods;
drop policy if exists "authenticated write periods" on periods;
create policy "authenticated read periods" on periods for select to authenticated using (true);
create policy "authenticated write periods" on periods for all to authenticated using (true) with check (true);

drop policy if exists "authenticated read categories" on categories;
drop policy if exists "authenticated write categories" on categories;
create policy "authenticated read categories" on categories for select to authenticated using (true);
create policy "authenticated write categories" on categories for all to authenticated using (true) with check (true);

drop policy if exists "authenticated read budget_lines" on budget_lines;
drop policy if exists "authenticated write budget_lines" on budget_lines;
create policy "authenticated read budget_lines" on budget_lines for select to authenticated using (true);
create policy "authenticated write budget_lines" on budget_lines for all to authenticated using (true) with check (true);

drop policy if exists "authenticated read recurring_transactions" on recurring_transactions;
drop policy if exists "authenticated write recurring_transactions" on recurring_transactions;
create policy "authenticated read recurring_transactions" on recurring_transactions for select to authenticated using (true);
create policy "authenticated write recurring_transactions" on recurring_transactions for all to authenticated using (true) with check (true);

drop policy if exists "authenticated read transactions" on transactions;
drop policy if exists "authenticated write transactions" on transactions;
create policy "authenticated read transactions" on transactions for select to authenticated using (true);
create policy "authenticated write transactions" on transactions for all to authenticated using (true) with check (true);

drop policy if exists "authenticated read transaction_splits" on transaction_splits;
drop policy if exists "authenticated write transaction_splits" on transaction_splits;
create policy "authenticated read transaction_splits" on transaction_splits for select to authenticated using (true);
create policy "authenticated write transaction_splits" on transaction_splits for all to authenticated using (true) with check (true);

drop policy if exists "authenticated read transaction_history" on transaction_history;
drop policy if exists "authenticated write transaction_history" on transaction_history;
create policy "authenticated read transaction_history" on transaction_history for select to authenticated using (true);
create policy "authenticated write transaction_history" on transaction_history for all to authenticated using (true) with check (true);

drop policy if exists "authenticated read objectives" on objectives;
drop policy if exists "authenticated write objectives" on objectives;
create policy "authenticated read objectives" on objectives for select to authenticated using (true);
create policy "authenticated write objectives" on objectives for all to authenticated using (true) with check (true);

drop policy if exists "authenticated read api_tokens" on api_tokens;
drop policy if exists "authenticated write api_tokens" on api_tokens;
create policy "authenticated read api_tokens" on api_tokens for select to authenticated using (true);
create policy "authenticated write api_tokens" on api_tokens for all to authenticated using (true) with check (true);

drop policy if exists "authenticated read profiles" on profiles;
drop policy if exists "individual write own profile" on profiles;
create policy "authenticated read profiles" on profiles for select to authenticated using (true);
create policy "individual write own profile" on profiles for all to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);
