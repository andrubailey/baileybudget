# Bailey Budget — Context Doc

Written during a shutdown audit on 2026-09-09, before an extended pause. This is
the stuff that isn't obvious from reading the code cold — decisions, reasons,
and known sharp edges. Read this before you touch anything.

## The most important thing to know first

**This codebase has been developed across multiple concurrent Claude sessions
running at the same time**, not one linear conversation. That's why:
- Some things look like they were fixed, then partially reverted, then fixed
  differently — that's real, not a hallucination on your part.
- Comments sometimes reference a "previous version" that no longer matches
  what's actually in the file above them — a later session changed the code
  but the comment above it is stale.
- There is **no single person (or session) who knows the whole codebase** —
  including me. This doc and the audit that produced it are the closest thing
  to a full picture that currently exists.

## Data model decisions that aren't obvious from the schema

**Debt accounts (credit cards, loans) use an inverted sign convention.**
For a normal account, `kind: "income"` adds money, `kind: "expense"` removes
it. For an `is_debt: true` account, this is deliberately flipped: a **charge**
is stored as `kind: "income"` (increases what's owed) and a **payment** is
stored as `kind: "expense"` (decreases what's owed). This also applies to
transfers — a transfer *into* a debt account is a payment (decreases owed), a
transfer *out* of one (a cash advance) increases what's owed. This logic is
duplicated in a few places in `lib/queries.ts` (`getAccountsWithBalances`,
`getNetWorthHistory`, `getDebtBalanceHistory`) — if you ever touch debt-account
math, grep for `is_debt` and update all of them together, not just one.

**Balances are always computed, never stored as a running counter.**
`balance = starting_balance + sum(all transactions affecting this account)`,
computed fresh on every read. This was a deliberate choice (confirmed during
the shutdown audit) — it's what makes the app safe against the classic
"read-balance, add-amount, write-balance" race condition when two people edit
concurrently. Don't "optimize" this into a stored/cached balance column
without re-solving that problem.

**Supabase/PostgREST silently caps an unpaginated `.select()` at 1000 rows.**
This bit the app once already (accounts/net-worth math was silently wrong
once transaction count crossed 1000). The fix pattern lives in
`lib/queries.ts`: `fetchAllTransactionRows()` and `getAllAccountsRaw()` /
`getAllCategoriesRaw()` are `cache()`-wrapped, paginated helpers that page
through in `PAGE_SIZE = 1000` chunks. **As of this audit, four Reports-page
query functions do NOT use this pattern and are not paginated**:
`getCategoryProgressForRange`, `getMonthlyTotals`, `getRecurringVsOtherByMonth`,
`getTopCategoryByMonth` — all in `lib/queries.ts`. 2026 already has 871
transactions as of Sept 9; this will likely cross 1000 before year-end and
start silently under-counting Reports numbers. See RESUME.md for priority.

**Savings Rate is net of savings-account transfers, not just income − expense.**
Income-minus-expense is blind to money moved into/out of a savings account
(a transfer, not an expense) — so pulling $5,000 out of savings for something
big wouldn't show up as spending at all under a naive calculation, and the
rate would look great in the exact month you drained your safety net. The
fix: `netSaved = income - expense + savingsTransfers`, where
`savingsTransfers` (from `getSavingsTransferTotal`) nets transfers into
savings-type accounts against transfers out. This was a deliberate design
choice after actually hitting this exact confusing scenario.

**A category counts as "over budget" even with zero planned amount.**
`overBudget: actual > planned` (no `planned > 0` guard) — this was
*intentionally* changed partway through development. The original logic
required `planned > 0`, meaning spending in a totally unbudgeted category
never triggered the "over" warning, which defeated the point (unbudgeted
spending is exactly as much "over" as blowing past a real budget). If this
ever looks wrong, it isn't — it's the corrected version.

**Merchant-name cleanup (`lib/merchant-name.ts::cleanMerchantDescription`)
only touches strings with NO lowercase letters at all.** This guard exists
because of a real incident: the function used to run on every description
regardless of source, and it corrupted ~271 real transactions in the live
database by title-casing and truncating perfectly normal hand-typed text
("Kitchen 121" → "Kitchen", "UnitedHealth Insurance" →
"Unitedhealth Insurance", "Transfer from Personal Checking" → "...From
Personal Checking"). It was caught, reverted using a before/after log, and
fixed with the "only ALL-CAPS raw statement text" guard. **Do not remove that
guard or run the cleanup logic against anything that might contain
human-typed text** — it's the only thing preventing a repeat.

**Transfers to the AMEX account are relabeled "American Express Payment" for
display only.** `lib/format.ts::transferDisplayDescription` checks
`toAccountBank === "Amex"` and swaps the label in list views (Recent
Transactions, the Transactions table). The actual stored `description`
column is untouched — this is purely a rendering rule, not a data rule. If
another credit card account needs the same treatment, extend that function's
bank check, don't touch the database.

**`is_business` on accounts drives "Business"/"Personal" grouping** on the
dashboard's Accounts card and (at one point) the Recent Transactions list —
check current `page.tsx`/`recent-transactions-list.tsx` for whether the
grouping is still there, since it was added and later partially simplified
away in favor of a flat list with an inline account label.

## Deletion model — why it's structured this way

Nothing in the app hard-deletes transactions, accounts, or categories.
Transactions get `deleted_at` (soft delete, `restoreTransaction` brings them
back, undo toast for 8 seconds, then only recoverable via Supabase directly —
no in-app trash view exists yet). Accounts and categories only ever get
deactivated (`is_active`/`toggleAccountActive`, `updateCategoryActive`) — there
is no `deleteAccount` or `deleteCategory` action at all, on purpose, because
`transactions.account_id`/`category_id` are `ON DELETE SET NULL` and a hard
delete would silently orphan real transaction history.

**The one real landmine**: `transactions.period_id` is
`ON DELETE CASCADE` (`supabase/schema.sql`) — deleting a `periods` row hard-
deletes every transaction dated in it, no soft delete, no undo. There is
currently no `deletePeriod` action and no delete UI for periods, so this can
only happen via a manual Supabase dashboard/SQL edit. If you ever add a
"delete period" feature, that cascade needs to become a guard/confirmation
step, not a silent DB-level cascade.

## RLS / auth model

Fully permissive by design: any authenticated user (just the two of you) can
read/write everything except each other's own `profiles` row. This is
intentional for a two-person shared household budget — there's no per-user
data partitioning anywhere, and that's correct for this use case, not an
oversight.

## Columns that exist in the schema but have no UI

- `categories.rollover` — the *math* is fully built (`getRolloverAmounts` in
  `lib/queries.ts`) and would work correctly if a category had it set, but
  there's no way to turn it on/off from the UI. Currently always `false` at
  creation.
- `categories.group_name` — displayed and used for grouping in the budget
  views, but nothing ever writes it. Can only be set via direct DB edit.
- `categories.is_need` — exists, defaults to `false`, and is **never read
  anywhere**. This looks like the start of a "needs vs. wants" feature that
  never got past the schema. Decide whether to finish it or drop the column
  — right now it's just dead weight.

## Backup / export — currently broken, don't trust it

`app/api/export/route.ts` has two branches: an unfiltered one meant to dump
every table (accounts, periods, categories, budget_lines, transactions,
objectives), and a filtered one that returns transactions only. The
unfiltered branch is **not paginated** and will silently truncate at 1000
rows (already exceeded — 1,072 total transactions as of this audit). Worse,
**the UI only ever links to the filtered (transactions-only) branch** — there
is currently no working one-click "back up everything" path in the app at
all. If you need your data out before Supabase access lapses, do a manual
SQL-editor export from the Supabase dashboard instead of trusting this route.

## Scripts directory

- `migrate-notion*.mjs` — one-time Notion→Supabase import, already run, done,
  harmless to leave.
- `backfill-transfer-descriptions.mjs` — rewrites every transfer's
  description to "From X to Y" using current account names. Safe to re-run
  (idempotent — skips already-correct rows) **unless an account has been
  renamed since a transfer was created**, in which case re-running it will
  silently overwrite old transfer descriptions with the new name, with no
  log and no way to recover the old text (it bypasses `updateTransaction`,
  so nothing lands in `transaction_history` either).
- `backfill-merchant-descriptions.mjs` — the merchant-cleanup script
  described above. Writes a full before/after JSON log on every run
  (`scripts/merchant-description-backfill-<timestamp>.json`) specifically so
  it can be reverted. Safe to re-run — already-clean descriptions are
  skipped.
- `revert-merchant-descriptions.mjs <log-file.json>` — generic revert tool,
  requires an explicit log file argument, refuses to run bare.

All scripts read `SUPABASE_SERVICE_ROLE_KEY` from `.env.local` only, never
hardcoded. `.env.local` is `.gitignore`'d and has never been committed. The
GitHub repo (`andrubailey/baileybudget`) **is public** — keep it that way,
i.e. never add a script that hardcodes the service-role key "just to test
something quickly."
