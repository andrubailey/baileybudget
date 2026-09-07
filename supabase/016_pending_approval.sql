-- Run this once in the Supabase SQL editor. Lets a transaction be flagged
-- "needs approval" — for a planned purchase one spouse wants to run by the
-- other before (or right after) it happens, distinct from the existing
-- `cleared` reconciliation flag.

alter table transactions add column if not exists pending_approval boolean not null default false;
