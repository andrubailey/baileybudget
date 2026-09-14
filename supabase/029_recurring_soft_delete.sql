-- Soft-delete for recurring rules, matching the transactions/objectives
-- deleted_at pattern (see 008_transaction_extras.sql, 023_objective_soft_delete.sql)
-- so deleting a recurring bill/income rule can offer the same undo toast
-- instead of a plain, permanent "can't be undone". Previously the only way
-- to stop a rule was pause (is_active=false), which keeps it around forever
-- even for a rule that was set up by mistake.
alter table recurring_transactions add column if not exists deleted_at timestamptz;

create index if not exists recurring_transactions_deleted_at_idx on recurring_transactions(deleted_at);
