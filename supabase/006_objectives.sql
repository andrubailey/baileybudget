-- Run this once in the Supabase SQL editor to add financial objectives
-- (status, name, date range, notes) shown on the dashboard.

create table if not exists objectives (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'Not Started'
    check (status in ('Not Started', 'In Progress', 'On Hold', 'Achieved')),
  start_date date,
  end_date date,
  notes text,
  created_at timestamptz not null default now()
);

alter table objectives enable row level security;

drop policy if exists "authenticated read objectives" on objectives;
drop policy if exists "authenticated write objectives" on objectives;
create policy "authenticated read objectives" on objectives for select to authenticated using (true);
create policy "authenticated write objectives" on objectives for all to authenticated using (true) with check (true);
