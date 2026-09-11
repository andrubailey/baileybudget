-- Soft-delete for objectives (goals), matching the transactions table's
-- deleted_at pattern (see 008_transaction_extras.sql) so goal deletion can
-- offer the same undo toast instead of a plain, permanent "can't be undone".
alter table objectives add column if not exists deleted_at timestamptz;

create index if not exists objectives_deleted_at_idx on objectives(deleted_at);
