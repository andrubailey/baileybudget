-- Run this once in the Supabase SQL editor. Stores each person's Insights
-- page setup on their own profile: the selected time range (and custom
-- dates), card order, and hidden cards — so it follows them across devices.
-- Writes are already limited to your own row by the profiles RLS policy
-- (see 018_profiles.sql).

alter table profiles add column if not exists insights_prefs jsonb;
