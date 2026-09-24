-- Who an event is for — a fixed set (the two of you, kids, or the whole
-- family), not a household-members table, since "Kids"/"Family" aren't
-- people who ever log in.
alter table calendar_events add column if not exists assignee text
  check (assignee in ('andru', 'geralyn', 'kids', 'family'));
