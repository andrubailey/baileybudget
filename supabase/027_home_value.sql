-- An estimate you type in yourself (Zillow, an appraisal, a gut feeling) —
-- there's no bank-synced source for what a house is worth, unlike every
-- other balance in this app. Nullable: equity has nothing to show against
-- until someone sets this once from the mortgage card.
alter table loans add column if not exists estimated_home_value numeric;
