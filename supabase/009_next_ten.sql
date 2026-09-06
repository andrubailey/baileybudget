-- Run this once in the Supabase SQL editor. Adds support for: debt payoff
-- tracking, low-balance alerts, budget rollover, recurring transactions,
-- split transactions, and receipt attachments.

alter table accounts add column if not exists is_debt boolean not null default false;
alter table accounts add column if not exists low_balance_alert numeric;

alter table categories add column if not exists rollover boolean not null default false;

alter table transactions add column if not exists receipt_url text;
alter table transactions add column if not exists recurring_transaction_id uuid;

create table if not exists recurring_transactions (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('income', 'expense')),
  description text not null,
  amount numeric not null,
  account_id uuid references accounts(id) on delete set null,
  category_id uuid references categories(id) on delete set null,
  tags text[] not null default '{}',
  day_of_month integer not null check (day_of_month between 1 and 28),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists transaction_splits (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  category_id uuid references categories(id) on delete set null,
  amount numeric not null,
  created_at timestamptz not null default now()
);

create index if not exists transaction_splits_transaction_idx on transaction_splits(transaction_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'transactions_recurring_transaction_id_fkey'
  ) then
    alter table transactions
      add constraint transactions_recurring_transaction_id_fkey
      foreign key (recurring_transaction_id) references recurring_transactions(id) on delete set null;
  end if;
end $$;

alter table recurring_transactions enable row level security;
alter table transaction_splits enable row level security;

drop policy if exists "authenticated read recurring_transactions" on recurring_transactions;
drop policy if exists "authenticated write recurring_transactions" on recurring_transactions;
create policy "authenticated read recurring_transactions" on recurring_transactions for select to authenticated using (true);
create policy "authenticated write recurring_transactions" on recurring_transactions for all to authenticated using (true) with check (true);

drop policy if exists "authenticated read transaction_splits" on transaction_splits;
drop policy if exists "authenticated write transaction_splits" on transaction_splits;
create policy "authenticated read transaction_splits" on transaction_splits for select to authenticated using (true);
create policy "authenticated write transaction_splits" on transaction_splits for all to authenticated using (true) with check (true);
