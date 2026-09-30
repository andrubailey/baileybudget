-- Categories whose spending is tracked but never planned — Tithe follows
-- income rather than a monthly plan, so it has no planned amount and stays
-- out of every "spent vs. budget" total.
alter table categories add column if not exists exclude_from_budget boolean not null default false;

update categories set exclude_from_budget = true where name = 'Tithe';

-- Past months keep what was planned at the time; the current and future
-- months drop the excluded categories' planned amounts.
delete from budget_lines
where category_id in (select id from categories where exclude_from_budget)
  and period_id in (select id from periods where end_date >= current_date);
