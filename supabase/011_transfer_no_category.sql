-- Run this once in the Supabase SQL editor. A transfer moves money between
-- two of the household's own accounts — it isn't spend against a budget
-- category, so it should never be able to carry a category_id. This adds a
-- hard constraint so that can't happen even if a future bug tries it
-- (existing rows are expected to already satisfy this; createTransfer has
-- always inserted category_id: null for transfers).

alter table transactions
  drop constraint if exists transactions_transfer_no_category;

alter table transactions
  add constraint transactions_transfer_no_category
  check (kind <> 'transfer' or category_id is null);
