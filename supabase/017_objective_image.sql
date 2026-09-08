-- Run this once in the Supabase SQL editor. Lets a goal/objective carry an
-- image URL, used as the background of the featured-goal banner on the
-- dashboard.

alter table objectives add column if not exists image_url text;
