-- Run this once in the Supabase SQL editor. Every range-based query
-- (dashboard, weekly recap, transactions search) filters on txn_date, but
-- it had no index — this speeds those up as transaction history grows.

create index if not exists transactions_txn_date_idx on transactions(txn_date);
