-- Run this once in the Supabase SQL editor. Lets each person set a display
-- name and avatar image, edited from the profile chip in the sidebar.

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  updated_at timestamptz not null default now()
);

alter table profiles enable row level security;

-- Same "shared household" model as every other table here — either person
-- can read both profiles (so you see your spouse's display name/avatar too),
-- but each person can only write their own row.
drop policy if exists "authenticated read profiles" on profiles;
drop policy if exists "individual write own profile" on profiles;
create policy "authenticated read profiles" on profiles for select to authenticated using (true);
create policy "individual write own profile" on profiles for all to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);
