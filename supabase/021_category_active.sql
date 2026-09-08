-- Run this once in the Supabase SQL editor. Lets a category be deactivated
-- (hidden from new transactions/budgeting) instead of only ever deleted —
-- keeps its history (past transactions, past planned amounts) intact.

alter table categories add column if not exists is_active boolean not null default true;
