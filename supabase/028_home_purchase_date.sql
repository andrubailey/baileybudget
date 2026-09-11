-- Equity has nothing to do with Net Worth before the house was actually
-- bought — without this, the trend comparison against a prior month you
-- didn't yet own the house in would silently credit you with equity you
-- didn't have then, understating how much net worth genuinely jumped the
-- month of the purchase.
alter table loans add column if not exists purchase_date date;

update loans set purchase_date = '2026-06-15'
where loan_number_last4 = '5053' and purchase_date is null;
