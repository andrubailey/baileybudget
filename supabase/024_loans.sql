-- Loans (the home mortgage) tracked alongside accounts but deliberately not
-- one of them: a loan's balance stays out of Net Worth and account totals.
-- The balance is anchored to a statement (principal_balance as of
-- balance_as_of) and then lowered by the principal share of each matching
-- payment transaction logged after that date — the full payment still
-- counts as a normal expense in the budget. See lib/loan-math.ts.
create table if not exists loans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  lender text,
  property_address text,
  borrowers text,
  -- Only the last four digits; the full loan number isn't needed here.
  loan_number_last4 text,
  -- Annual percentage, e.g. 5.125.
  interest_rate numeric not null,
  original_balance numeric not null,
  first_payment_date date not null,
  maturity_date date not null,
  -- Statement anchor: principal owed after every payment dated on or before
  -- balance_as_of.
  principal_balance numeric not null,
  balance_as_of date not null,
  next_payment_due date not null,
  escrow_balance numeric,
  -- Full monthly payment (principal + interest + escrow).
  monthly_payment numeric not null,
  -- An expense counts as a payment when its description contains this text
  -- (case-insensitive) or it's in payment_category_id.
  payment_match text,
  payment_category_id uuid references categories(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table loans enable row level security;

drop policy if exists "authenticated read loans" on loans;
drop policy if exists "authenticated write loans" on loans;
create policy "authenticated read loans" on loans for select to authenticated using (true);
create policy "authenticated write loans" on loans for all to authenticated using (true) with check (true);

-- The Rocket Mortgage loan on 168 Warrior Court, from the Sep 2026 loan
-- details. The Aug 7, 2026 payment is already reflected in the balance.
insert into loans (
  name, lender, property_address, borrowers, loan_number_last4,
  interest_rate, original_balance, first_payment_date, maturity_date,
  principal_balance, balance_as_of, next_payment_due, escrow_balance,
  monthly_payment, payment_match, payment_category_id
)
select
  'Mortgage', 'Rocket Mortgage', '168 Warrior Court, Hoschton, GA 30548',
  'Andru Bailey, Geralyn Bailey', '5053',
  5.125, 361241.00, '2026-08-01', '2056-07-01',
  360816.89, '2026-08-07', '2026-09-01', 1216.60,
  2659.50, 'rocket mortgage',
  (select id from categories where name = 'Mortgage' and kind = 'expense' limit 1)
where not exists (select 1 from loans where loan_number_last4 = '5053');
