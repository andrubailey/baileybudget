-- Run this once in the Supabase SQL editor. Tags were never fully adopted
-- and added a filter/column that duplicated what categories already do —
-- removing the property entirely rather than leaving it half-used.

alter table transactions drop column if exists tags;
alter table recurring_transactions drop column if exists tags;
