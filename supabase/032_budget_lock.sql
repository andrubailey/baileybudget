-- Lets a period's planned amounts be frozen as a reference point (so "what
-- did we say we'd spend" survives later edits) without actually blocking
-- edits — locking just snapshots budget_lines.planned_amount per category at
-- that moment; the live budget_lines rows stay the single source of truth
-- for "current" planned, same as everywhere else in the app.
alter table periods add column if not exists budget_locked_at timestamptz;
alter table periods add column if not exists budget_locked_by_email text;
alter table periods add column if not exists budget_lock_snapshot jsonb;
