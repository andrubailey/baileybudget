-- Run this once in the Supabase SQL editor to move from "categories are
-- global, budget_lines holds the per-period planned amount" to "categories
-- belong to one period directly" (matching how the Notion template worked:
-- e.g. "Groceries" in September and "Groceries" in October are separate rows).

alter table categories add column if not exists period_id uuid references periods(id) on delete cascade;
alter table categories add column if not exists planned_amount numeric not null default 0;

create index if not exists categories_period_idx on categories(period_id);

drop table if exists budget_lines;
