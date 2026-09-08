-- Run this once in the Supabase SQL editor. Lets an account carry a custom
-- uploaded photo (e.g. a bank not in the built-in logo list, or a personal
-- photo for a cash/savings-goal account), shown instead of the bank-name
-- badge or generic icon on the Accounts page.

alter table accounts add column if not exists logo_url text;

-- Public storage bucket for account photos. Accounts are shared by the
-- whole household (no per-account owner), so any signed-in user can manage
-- any file here — unlike the avatars bucket, which is scoped per-user.
insert into storage.buckets (id, name, public)
values ('account-logos', 'account-logos', true)
on conflict (id) do nothing;

create policy "Account logos are publicly readable"
  on storage.objects for select
  using (bucket_id = 'account-logos');

create policy "Signed-in users can upload account logos"
  on storage.objects for insert
  with check (bucket_id = 'account-logos' and auth.uid() is not null);

create policy "Signed-in users can update account logos"
  on storage.objects for update
  using (bucket_id = 'account-logos' and auth.uid() is not null);

create policy "Signed-in users can delete account logos"
  on storage.objects for delete
  using (bucket_id = 'account-logos' and auth.uid() is not null);
