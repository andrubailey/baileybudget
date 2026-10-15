-- A month can only exist once. The current month is created on first load,
-- and several requests arriving together on the 1st each created it (four
-- "October 2026" rows were made in the same second). With this index the
-- app's insert becomes "create if missing" (on conflict do nothing).
-- Fails if duplicate months already exist — merge or delete those first.
create unique index if not exists periods_start_date_key on periods(start_date);
