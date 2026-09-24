-- Shared calendar events. Self-contained (no Google/Apple sync) — same
-- manual-entry philosophy as the rest of the app. Weekly recurrence needs no
-- extra column: the anchor event_date's weekday is the recurrence weekday,
-- and occurrences are projected virtually at read time (see lib/calendar.ts),
-- the same "don't materialize rows" approach recurring bills already use.
create table if not exists calendar_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  event_date date not null,
  start_time time,
  end_time time,
  notes text,
  recurrence text not null default 'none' check (recurrence in ('none', 'weekly')),
  created_by uuid references auth.users(id) on delete set null,
  created_by_email text,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists calendar_events_date_idx on calendar_events(event_date);
create index if not exists calendar_events_deleted_at_idx on calendar_events(deleted_at);

alter table calendar_events enable row level security;

drop policy if exists "authenticated read calendar_events" on calendar_events;
drop policy if exists "authenticated write calendar_events" on calendar_events;
create policy "authenticated read calendar_events" on calendar_events for select to authenticated using (true);
create policy "authenticated write calendar_events" on calendar_events for all to authenticated using (true) with check (true);
