-- Run this once in the Supabase SQL editor. Lets each account store a
-- direct link to its bank login page.

alter table accounts add column if not exists login_url text;
