-- Personal Budgeting App schema
-- Run this once in the Supabase SQL editor (Project > SQL Editor > New query).

create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  starting_balance numeric not null default 0,
  goal numeric,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

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

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('income', 'expense')),
  description text not null,
  amount numeric not null,
  txn_date date not null default current_date,
  account_id uuid references accounts(id) on delete set null,
  category_id uuid references categories(id) on delete set null,
  period_id uuid not null references periods(id) on delete cascade,
  tags text[] not null default '{}',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists transactions_period_idx on transactions(period_id);
create index if not exists transactions_account_idx on transactions(account_id);
create index if not exists transactions_category_idx on transactions(category_id);
create index if not exists budget_lines_period_idx on budget_lines(period_id);

-- Row Level Security: this is a 2-person shared household budget.
-- Any authenticated user (you + your wife) can read/write everything —
-- no per-user partitioning, since the whole point is shared data.

alter table accounts enable row level security;
alter table periods enable row level security;
alter table categories enable row level security;
alter table budget_lines enable row level security;
alter table transactions enable row level security;

create policy "authenticated read accounts" on accounts for select to authenticated using (true);
create policy "authenticated write accounts" on accounts for all to authenticated using (true) with check (true);

create policy "authenticated read periods" on periods for select to authenticated using (true);
create policy "authenticated write periods" on periods for all to authenticated using (true) with check (true);

create policy "authenticated read categories" on categories for select to authenticated using (true);
create policy "authenticated write categories" on categories for all to authenticated using (true) with check (true);

create policy "authenticated read budget_lines" on budget_lines for select to authenticated using (true);
create policy "authenticated write budget_lines" on budget_lines for all to authenticated using (true) with check (true);

create policy "authenticated read transactions" on transactions for select to authenticated using (true);
create policy "authenticated write transactions" on transactions for all to authenticated using (true) with check (true);
