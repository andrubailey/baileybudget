# Resume File — read this first, assume you remember nothing

Written 2026-09-09, at the start of an extended pause. Pair with `CONTEXT.md`
(the "why" behind decisions) — this file is the "where things stand."

## Where things actually stand right now

- **Last commit**: `2990697` — "Group accounts by Business/Personal/Debt, add
  page shortcuts, and polish transactions/search UX." Local `main` is 1
  commit ahead of `origin/main` (unpushed).
- **The working tree has a large uncommitted diff on top of that commit** —
  ~30 modified files, 2 files deleted-on-disk-but-not-in-git
  (`add-transfer-button.tsx`, `transaction-form.tsx` — both superseded by
  `quick-add-transfer.tsx`/`quick-add.tsx`, safe), and several new untracked
  files/routes: `app/(app)/add/`, `app/(app)/balances/`, `app/(app)/budget/`
  (a new mobile-only budget summary tab, distinct from the full `/budgets`
  management page — this is intentional, not a naming collision),
  `app/(app)/accounts-glance-card.tsx`, `app/(app)/dashboard-equal-height-row.tsx`,
  and this session's merchant-description backfill scripts + their JSON logs.
- **None of this uncommitted work is backed up anywhere except this machine.**
  This is genuinely the single biggest risk in the whole audit — bigger than
  any of the bugs below, because it's not "the app might show a wrong number,"
  it's "this could just disappear."
- Type-check, lint, and build all pass clean as of this audit
  (`npx tsc --noEmit`, `npm run lint`, `npm run build` — all exit 0).

## What I was mid-way through

The most recent thread of work (this session) was: consistent merchant-name
cleanup for transaction descriptions. Built `cleanMerchantDescription()`,
wired it into CSV import and the AI chat parser, then ran a database-wide
backfill — which initially over-corrected and mangled ~271 real, already-fine
descriptions (see `CONTEXT.md` for what happened). That was caught, fully
reverted using a saved before/after log, the underlying bug was fixed with a
proper safety guard, and it was re-run successfully. **This part is done and
verified safe** — not a loose thread, just recent enough to explain why there
are three extra files in `scripts/` right now.

Before that: a long stretch of UI/UX polish across Overview, Budgets, Goals,
and the transaction edit modal (animations, spacing, the segmented progress
bar, the "American Express Payment" display label, toast notifications for
save/delete/restore). All of that is finished and working.

## The next 3–5 things, in order, and why

1. **Commit and push everything currently sitting uncommitted.** Zero risk,
   prevents the one genuinely catastrophic outcome (losing real work to a
   disk failure or accidental `git clean` during a multi-month gap). Do this
   before anything else, today, before you close the laptop.

2. **Fix the Reports-page pagination gap** in `lib/queries.ts`:
   `getCategoryProgressForRange`, `getMonthlyTotals`,
   `getRecurringVsOtherByMonth`, `getTopCategoryByMonth` are not paginated.
   2026 already has 871 transactions as of this audit and will likely cross
   the 1000-row Supabase cap before the year ends — at which point Reports
   silently starts showing wrong numbers with no error. The fix pattern
   already exists in the same file (`fetchAllTransactionRows`,
   `getAllAccountsRaw`) — it's a mechanical apply, not a design problem.

3. **Do a manual backup before/shortly after resuming.** The in-app export
   route is broken (see `CONTEXT.md`) and can't be trusted. Do a one-time
   manual export from the Supabase SQL editor (or fix the export route
   first, then use it) as real insurance against a Supabase free-tier
   inactivity pause or any other access issue over a multi-month gap.

4. **Decide what to do about split-transaction editing.** Opening a split
   transaction in the generic edit modal and saving can silently desync its
   `amount`/`category_id` from its actual `transaction_splits` rows — there's
   no special handling for split parents in `transaction-detail-modal.tsx`.
   Cheapest safe fix: detect a split parent and block/warn instead of
   allowing a plain edit, until real split-editing gets built. This matters
   more than the other half-finished features because it's an *active
   corruption risk* for data you're still adding day to day, not just a
   missing feature.

5. **Triage the half-finished-feature list from the shutdown audit** (full
   detail below) — recurring-transaction management, category rollover UI,
   transaction edit-history display, and a short list of confirmed-dead code
   to delete. None of these are urgent, but each one is currently a "looks
   wired up, actually isn't" trap for future-you. Better to spend 30 minutes
   turning each into either "finished" or "deliberately left, here's why" than
   to rediscover the confusion from scratch.

## What I was NOT stuck on

No open technical blockers, no unresolved design question I couldn't answer,
no external dependency waiting on someone else. Everything below was a
scope/priority decision deferred to you, not a problem I couldn't solve.

## Full half-finished-feature list (detail, from the shutdown audit)

- **Recurring transactions**: create-only. "Make this recurring" works from
  Quick Add; there's no page to view, edit, deactivate, or delete an existing
  recurring rule once created (`getRecurringTransactions`,
  `toggleRecurringActive` both exist and are unused). Once you check the box,
  it silently runs forever unless you go into Supabase directly to stop it.
- **Transaction edit history**: fully captured (every edit snapshots the
  before-state to `transaction_history`), never displayed anywhere
  (`getTransactionHistory`/`getHistoryForTransaction` are unused). The table
  just grows forever with no way to see it in the app.
- **Category rollover**: math is fully correct and already folds into budget
  totals if the flag is set — but nothing in the UI can ever set it. Direct
  DB edit only.
- **`categories.is_need`**: exists in the schema, always `false`, never read.
  Looks like an abandoned "needs vs. wants" feature. Decide: finish it or
  drop the column.
- **`schema.sql` drift**: `accounts.logo_url` (added by migration
  `020_account_logo.sql`, actively used in code) was never added to
  `supabase/schema.sql`. Anyone bootstrapping a fresh database from
  `schema.sql` alone (skipping the numbered migrations) gets a broken
  account-logo upload. One-line fix.
- **Confirmed dead code, safe to delete** (zero callers anywhere, verified):
  in `app/actions.ts` — `updateAccountBank`, `updateAccountType`,
  `updateAccountLoginUrl`, `updateAccountGoal`, `toggleAccountActive`,
  `updateAccountIsDebt`, `updateAccountLowBalanceAlert` (all superseded by
  `updateAccountDetails`), `updateObjectiveLinkedAccount`. Components:
  `app/(app)/expense-donut.tsx`, `app/(app)/money-flow-chart.tsx` (+ its
  backing `getMonthlyFlow` in `lib/queries.ts`), `app/(app)/page-tabs.tsx`,
  `app/(app)/range-switcher.tsx`, `app/(app)/accounts/net-worth-chart.tsx`,
  `lib/account-colors.ts` (whole file).
- `createRecurringFromTransaction` exists as a server action, described in
  its own comment as "the detail modal's one-click version" of making
  something recurring, but no button anywhere calls it. Either wire it up
  next to the existing recurring toggle, or delete it.

## Quick orientation if you're re-reading the code cold

- App code: `app/(app)/` for authenticated pages, `app/actions.ts` for all
  server actions (mutations), `lib/queries.ts` for all reads.
- `supabase/schema.sql` is the full current shape; `supabase/0XX_*.sql` are
  the numbered migrations that got you there incrementally — but see the
  `logo_url` drift note above, they're not perfectly in sync.
- `supabase/verify_migrations.sql` is a diagnostic checklist script but is
  itself stale (stops checking at migration 016 of 22) — don't trust a clean
  run of it as proof everything's migrated.
