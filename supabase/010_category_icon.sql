-- Lets a category's emoji be overridden instead of always relying on the
-- keyword-guessing rules in lib/category-icons.ts, which start misfiring
-- once there are 30+ categories with overlapping words.

alter table categories add column if not exists icon text;
