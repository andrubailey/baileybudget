-- Run this once in the Supabase SQL editor. Adds columns needed for:
-- notes, soft-delete (undo), cleared/pending reconciliation, and showing
-- who logged each transaction.

alter table transactions add column if not exists notes text;
alter table transactions add column if not exists deleted_at timestamptz;
alter table transactions add column if not exists cleared boolean not null default false;
alter table transactions add column if not exists created_by_email text;

create index if not exists transactions_deleted_at_idx on transactions(deleted_at);
