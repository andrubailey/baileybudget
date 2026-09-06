-- Read-only diagnostic — not a migration, nothing to "run once." Paste this
-- into the Supabase SQL editor any time to check whether every migration in
-- this folder has actually been applied to the live database. Any row with
-- ok = false means that migration still needs to be run.
--
-- (Two checks are inverted on purpose: 014_drop_tags.sql removes a column,
-- so those pass when the column is ABSENT.)

select * from (
  values
    ('003_accounts_bank', exists (select 1 from information_schema.columns where table_name='accounts' and column_name='bank')),
    ('004_categories_global_again (budget_lines table)', exists (select 1 from information_schema.tables where table_name='budget_lines')),
    ('005_accounts_sort_order', exists (select 1 from information_schema.columns where table_name='accounts' and column_name='sort_order')),
    ('006/007_objectives (table)', exists (select 1 from information_schema.tables where table_name='objectives')),
    ('006_transfers (to_account_id)', exists (select 1 from information_schema.columns where table_name='transactions' and column_name='to_account_id')),
    ('008_transaction_extras (notes)', exists (select 1 from information_schema.columns where table_name='transactions' and column_name='notes')),
    ('008_transaction_extras (deleted_at)', exists (select 1 from information_schema.columns where table_name='transactions' and column_name='deleted_at')),
    ('008_transaction_extras (cleared)', exists (select 1 from information_schema.columns where table_name='transactions' and column_name='cleared')),
    ('008_transaction_extras (created_by_email)', exists (select 1 from information_schema.columns where table_name='transactions' and column_name='created_by_email')),
    ('009_next_ten (accounts.is_debt)', exists (select 1 from information_schema.columns where table_name='accounts' and column_name='is_debt')),
    ('009_next_ten (accounts.low_balance_alert)', exists (select 1 from information_schema.columns where table_name='accounts' and column_name='low_balance_alert')),
    ('009_next_ten (categories.rollover)', exists (select 1 from information_schema.columns where table_name='categories' and column_name='rollover')),
    ('009_next_ten (recurring_transactions table)', exists (select 1 from information_schema.tables where table_name='recurring_transactions')),
    ('009_next_ten (transaction_splits table)', exists (select 1 from information_schema.tables where table_name='transaction_splits')),
    ('009_next_ten (transactions.recurring_transaction_id)', exists (select 1 from information_schema.columns where table_name='transactions' and column_name='recurring_transaction_id')),
    ('010_category_icon', exists (select 1 from information_schema.columns where table_name='categories' and column_name='icon')),
    ('011_transfer_no_category (constraint)', exists (select 1 from information_schema.table_constraints where table_name='transactions' and constraint_name='transactions_transfer_no_category')),
    ('012_ten_more (categories.group_name)', exists (select 1 from information_schema.columns where table_name='categories' and column_name='group_name')),
    ('012_ten_more (accounts.account_type)', exists (select 1 from information_schema.columns where table_name='accounts' and column_name='account_type')),
    ('012_ten_more (objectives.linked_account_id)', exists (select 1 from information_schema.columns where table_name='objectives' and column_name='linked_account_id')),
    ('012_ten_more (transaction_history table)', exists (select 1 from information_schema.tables where table_name='transaction_history')),
    ('013_account_login_url', exists (select 1 from information_schema.columns where table_name='accounts' and column_name='login_url')),
    ('014_drop_tags (transactions.tags gone)', not exists (select 1 from information_schema.columns where table_name='transactions' and column_name='tags')),
    ('014_drop_tags (recurring_transactions.tags gone)', not exists (select 1 from information_schema.columns where table_name='recurring_transactions' and column_name='tags')),
    ('015_txn_date_index', exists (select 1 from pg_indexes where tablename='transactions' and indexname='transactions_txn_date_idx'))
) as checks(migration, ok)
order by ok asc, migration asc;
