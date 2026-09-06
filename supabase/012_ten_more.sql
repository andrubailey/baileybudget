-- Run this once in the Supabase SQL editor. Adds support for: category
-- groups, account types, objective-to-account linking, and transaction edit
-- history.

alter table categories add column if not exists group_name text;

alter table accounts add column if not exists account_type text;

alter table objectives add column if not exists linked_account_id uuid references accounts(id) on delete set null;

create table if not exists transaction_history (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  edited_by_email text,
  edited_at timestamptz not null default now(),
  snapshot jsonb not null
);

create index if not exists transaction_history_transaction_idx on transaction_history(transaction_id);

alter table transaction_history enable row level security;

drop policy if exists "authenticated read transaction_history" on transaction_history;
drop policy if exists "authenticated write transaction_history" on transaction_history;
create policy "authenticated read transaction_history" on transaction_history for select to authenticated using (true);
create policy "authenticated write transaction_history" on transaction_history for all to authenticated using (true) with check (true);
