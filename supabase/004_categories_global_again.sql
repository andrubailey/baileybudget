-- Undoes 002_categories_per_period.sql (which was applied, then decided
-- against): categories go back to being a flat, shared list — each
-- transaction is tagged to one category directly, and planned amounts are
-- tracked per period via budget_lines instead of living on the category row.

alter table categories drop column if exists period_id;
alter table categories drop column if exists planned_amount;

create table if not exists budget_lines (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references categories(id) on delete cascade,
  period_id uuid not null references periods(id) on delete cascade,
  planned_amount numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (category_id, period_id)
);

create index if not exists budget_lines_period_idx on budget_lines(period_id);

alter table budget_lines enable row level security;
drop policy if exists "authenticated read budget_lines" on budget_lines;
drop policy if exists "authenticated write budget_lines" on budget_lines;
create policy "authenticated read budget_lines" on budget_lines for select to authenticated using (true);
create policy "authenticated write budget_lines" on budget_lines for all to authenticated using (true) with check (true);
