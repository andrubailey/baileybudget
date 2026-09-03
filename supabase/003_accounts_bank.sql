-- Run this once in the Supabase SQL editor to add a "bank" field to accounts,
-- so the Accounts page can show which bank each account is with.

alter table accounts add column if not exists bank text;
