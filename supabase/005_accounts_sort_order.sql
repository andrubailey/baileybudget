-- Adds a manual sort order to accounts so they can be drag-and-drop reordered.

alter table accounts add column if not exists sort_order integer not null default 0;
create index if not exists accounts_sort_order_idx on accounts(sort_order);
