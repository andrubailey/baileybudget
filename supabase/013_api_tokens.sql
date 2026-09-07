-- Run this once in the Supabase SQL editor. Adds personal access tokens for
-- the iOS Shortcuts integration (quick-add expense/income/transfer without
-- opening the app or logging in).

create table if not exists api_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  label text not null,
  created_by_email text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

alter table api_tokens enable row level security;

drop policy if exists "authenticated read api_tokens" on api_tokens;
drop policy if exists "authenticated write api_tokens" on api_tokens;
create policy "authenticated read api_tokens" on api_tokens for select to authenticated using (true);
create policy "authenticated write api_tokens" on api_tokens for all to authenticated using (true) with check (true);
