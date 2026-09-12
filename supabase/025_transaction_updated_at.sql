-- Lets updateTransaction detect a concurrent edit: without this, two people
-- editing the same transaction at once meant whoever saved second silently
-- overwrote the first person's changes with no warning to either of them.
alter table transactions add column if not exists updated_at timestamptz not null default now();
