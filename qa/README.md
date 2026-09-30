# Mobile QA tooling — Bailey Budget

Everything the QA rounds need, isolated from the app: a realistic seed dataset, a fake Supabase to serve it, a device matrix, automated audits, performance measurement, and regression tests. The app's own code, `package.json` and `.env.local` are never touched.

**Never point any of this at the real Supabase project.** The seed is two years of fake household data; the tooling refuses to write an env file containing a hosted Supabase URL, and the test app runs from a separate git worktree that has no real credentials in it.

- [checklist.md](checklist.md) — the living QA checklist every round runs against.
- [baseline/](baseline/) — what was broken before the rebuild (so regressions can be told apart from pre-existing problems).

## One-time setup

```bash
cd qa
npm install        # Playwright 1.63.0, pinned to browsers already cached on this Mac — no download
```

## The default dev dataset

```bash
node seed/generate.mjs                  # → .data/seed.json   (as-of today, ~2,200 transactions over 25 months)
node seed/generate.mjs --scale=5 --out=.data/seed-5x.json    # ~11,300 transactions, for performance
node seed/generate.mjs --as-of=2026-09-30                     # pin "today" (same seed + as-of = byte-identical output)
```

What's in it, on purpose: both of you logging (~60/40, plus unattributed rows like the AI Advisor bulk-insert incident), bank-style merchant strings up to 51 characters, heavy categories (Coffee, Dining, Groceries) and near-empty ones (Pet Insurance: one charge in two years; Donations: budgeted, never spent), a quiet month and a 19-day vacation gap followed by a backdated catch-up burst, legit duplicate-looking lunches and a real "we both logged it" duplicate, the same-amount-same-day-different-account $75 transfers, transfers, card payments, a refund to checking **and** a refund on the credit card, a $0 transaction, six amounts over $10,000, a split, soft-deleted rows, pending-approval purchases, month-boundary and timezone edges (11:40pm on the 31st, a late entry filed under the wrong month), float traps (three $0.10 charges, a 3-decimal amount), a locked-then-edited budget month, a closed card paid off to exactly $0, a mortgage, goals, and calendar events (weekly recurring, four on one day, one with an end before its start). Balances are realistic at both 1x and 5x — the generator pays the card in full and sweeps checking the way a real household does.

`.data/seed.json` is gitignored and regenerated on demand; the generator is the source of truth. `meta.edge_ids` in the output gives stable ids for each deliberate edge case.

## Run the app against it

```bash
node cli.mjs up                          # current HEAD, next dev, http://localhost:3200
node cli.mjs up --ref=14de90a            # any commit — the baseline, or whatever the agents merged
node cli.mjs up --prod                   # production build (use this for performance numbers)
node cli.mjs up --seed=.data/seed-5x.json
node cli.mjs up --lan                    # reachable from your phone on the same Wi-Fi (see below)
node cli.mjs status
node cli.mjs reset                       # full restart — see "Gotchas"
node cli.mjs down
```

`up` creates a git worktree for the ref in `../.budget-app-qa/<sha>` (outside the repo on purpose, so the app's type-check and lint never see it), writes an `.env.local` there pointing only at the mock, starts the mock Supabase on `127.0.0.1:54321`, starts Next on port 3200, and signs in both test users. Test identities live in `mock-supabase/test-users.mjs` (passwords are generated into `.data/test-passwords.json`, never committed); they exist only in the mock.

## The device matrix

| Name | Viewport (CSS px) | What it stands for |
|---|---|---|
| `small` | 375 × 667 | iPhone SE, installed PWA |
| `short` | 375 × 548 | iPhone SE in Safari with toolbars showing — the shortest real viewport |
| `large` | 430 × 932 | Pro Max class, with 59px top / 34px bottom safe areas |
| `landscape` | 932 × 430 | large phone rotated, 59px side safe areas |

Any screen at any device, one command:

```bash
node cli.mjs shot /budget --device=small          # → artifacts/shots/small/budget-{top,full}.png
node cli.mjs shot all --device=all                # every screen × every device
node cli.mjs shot /spending --engine=webkit       # Safari's engine (no safe-area emulation there)
```

Chromium is the default because it's the only engine that can emulate `env(safe-area-inset-*)`. No emulator can show a real on-screen keyboard, iOS's collapsing toolbars or PWA relaunch behavior — **those checks run on your phone**: `node cli.mjs up --lan`, open the printed URL on the same Wi-Fi, sign in with a test user. (Plain http on a LAN IP isn't a secure context, so the service worker won't register in this mode.)

## Audits, performance, faults

```bash
node cli.mjs audit                                # every screen × device → artifacts/<label>/audit.md
node cli.mjs audit /spending --engine=webkit
node cli.mjs perf                                 # needs `up --prod`; cold loads (wifi + Slow 4G), tab switches, tap latency
node scan/static.mjs --ref=HEAD                   # fixed keyboard offsets, 100vh, hardcoded timing/colors, duplicate components
node cli.mjs fault '{"latencyMs":800,"jitterMs":400}'
node cli.mjs fault '{"rules":[{"match":{"method":"POST","path":"/rest/v1/transactions"},"action":"drop-after-commit","times":1}]}'
node cli.mjs fault off
```

Fault actions: `drop` (connection dies before the server acts), `drop-after-commit` (the write lands, then the connection dies — the duplicate-on-retry case), `error500`, `delay` (`delayMs`). Rules match on method and path prefix; `times` limits how often they fire.

## Regression tests

```bash
npx playwright test                         # everything, every device project
npx playwright test --project=small
npx playwright test tests/trust.spec.mjs    # lose / duplicate / misstate a transaction
npx playwright show-report
```

- `tests/trust.spec.mjs` — duplicates on retry and on offline-queue replay, double-tap, half-typed entry surviving backgrounding and an iOS reload. Counts rows in the database, never trusts the UI.
- `tests/data-correctness.spec.mjs` — balances vs. an independent ledger (`lib/finance.mjs`), sum-of-parts, the same month's spending across screens, card purchases' sign, calendar order.
- `tests/layout.spec.mjs` — every screen in `screens.mjs` × every device: sideways overflow, bottom clearance, taps under the nav, clipped text, iOS zoom-on-focus inputs, 44px targets, status-bar overlap, console/hydration errors.
- `tests/keyboard.spec.mjs` — the Add sheet's three entry types with a modeled keyboard (full vs. numeric keypad heights per device, reported through a stand-in `visualViewport` the way iOS does): is each field and the submit button still visible?
- `tests/continuity.spec.mjs` — back closes the top layer instead of leaving the page; scroll position survives opening a transaction.
- `tests/network.spec.mjs` — opening the app with no signal; logging offline → shown as waiting → sent exactly once.
- `tests/two-people.spec.mjs` — Geralyn adds, Andru's open app: how long until he sees it, and is it attributed to her (takes ~75s).
- `tests/reconcile.spec.mjs` — the gap, the corrected balance, and whether the correction leaks into income/spending. **Adds rows** — run against a fresh `up`.
- `tests/motion.spec.mjs` — with Reduce Motion on, primary interactions don't animate.

Specs that add data use unique descriptions, so a full run is safe to repeat, but numbers drift (reconcile rows, test transactions). Start each round with a fresh `node cli.mjs up`.

When the rebuild renames a screen's route or a visible label, update `screens.mjs` or the one locator in the spec — the assertions stay the same.

## Gotchas (learned the hard way)

- **The app caches whole tables until one of its own writes invalidates them** (and Next 16 keeps the dev copy under `.next/dev/`). Changing data behind a running app — a mock reset, a direct table edit — leaves it serving stale numbers. `node cli.mjs reset` restarts everything with a clean `.next`; tests never reset data mid-run (unique descriptions isolate them).
- **Next refuses to cache any table over 2MB.** Around ~3,000 transactions the transactions snapshot crosses that, the cache silently stops working, and every page load re-downloads the entire table. The 5x seed is over the line; watch for `items over 2MB can not be cached` in `.data/logs/app-3200.log`.
- **Mobile Chromium widens the layout viewport to fit overflowing content**, so `window.innerWidth` hides the very overflow you're checking. The audit measures against the device's real width.
- The mock doesn't implement Supabase Realtime, so the "who's online" presence dot never lights up; its WebSocket errors are kept out of the error counts. Data freshness uses polling, which works.
- `lsof` is used to make sure an old server has really let go of its port before a new one starts; if `up` complains a port is busy with something it didn't start, free it and retry.

## Layout

```
qa/
  cli.mjs                 one entry point: up / down / status / shot / audit / perf / reset / fault
  devices.mjs             the device matrix
  screens.mjs             routes covered by audits and layout tests
  seed/generate.mjs       deterministic realistic-use seed (--scale, --as-of)
  mock-supabase/          fake PostgREST + GoTrue + Storage, fault injection, compatibility smoke test
  lib/                    stack launcher, in-page audit, perf harness, independent finance ledger
  scan/static.mjs         static source checks at any git ref
  tests/                  Playwright regression suites
  checklist.md            the living QA checklist
  baseline/               pre-rebuild findings
  .data/  artifacts/      generated (gitignored)
```
