-- Hand reconciliation against the real bank apps. Every confirmation is kept
-- as its own record so a row can say "confirmed 3 days ago" truthfully and so
-- the next reconcile knows which window of transactions to show.
create table if not exists account_reconciliations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  reconciled_at timestamptz not null default now(),
  -- What the bank app showed.
  statement_balance numeric not null,
  -- What this app computed at that moment, and the gap between the two. Both
  -- frozen at reconcile time: recomputing them later would erase the history
  -- of what was actually wrong.
  computed_balance numeric not null,
  difference numeric not null,
  -- Applied to the account's balance without creating a transaction. A
  -- reconciliation is not spending, so it must not show up in Activity or in
  -- any category total — but it does have to move the balance, which is why
  -- every balance calculation folds this column in.
  adjustment_amount numeric not null default 0,
  resolution text not null default 'matched' check (resolution in ('matched', 'adjusted', 'open')),
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_by_email text,
  created_at timestamptz not null default now()
);

create index if not exists account_reconciliations_account_idx
  on account_reconciliations(account_id, reconciled_at desc);

alter table account_reconciliations enable row level security;

drop policy if exists "authenticated read account_reconciliations" on account_reconciliations;
drop policy if exists "authenticated write account_reconciliations" on account_reconciliations;
create policy "authenticated read account_reconciliations" on account_reconciliations for select to authenticated using (true);
create policy "authenticated write account_reconciliations" on account_reconciliations for all to authenticated using (true) with check (true);

-- Last four digits, so a row can be matched against the bank app's own list
-- without the full number ever being stored.
alter table accounts add column if not exists account_mask text;

-- The "Balance adjustment" transactions the old reconcile action inserted are
-- left alone: they already moved balances, and rewriting history would change
-- past months' spending. New reconciles record the gap above instead.
