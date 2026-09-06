-- Adds a "transfer" transaction kind for moving money between two of your
-- own accounts, without counting as income or expense.

alter table transactions drop constraint if exists transactions_kind_check;
alter table transactions add constraint transactions_kind_check
  check (kind in ('income', 'expense', 'transfer'));

alter table transactions add column if not exists to_account_id uuid references accounts(id) on delete set null;
create index if not exists transactions_to_account_idx on transactions(to_account_id);
