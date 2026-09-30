# Mobile QA checklist

The one every round runs against. Each item says **how** it's checked — an automated test (runs on every round), a command that produces numbers, or a manual step on a real phone — and its **status at the pre-rebuild baseline** (`14de90a`, 2026-09-30), so a round can tell a regression from something that was already broken. Full findings for the baseline: [baseline/2026-09-30-baseline-14de90a.md](baseline/2026-09-30-baseline-14de90a.md).

**Running a round**

```bash
cd qa
node cli.mjs up --ref=<merged sha> --prod     # fresh data every time — some tests add rows
npx playwright test                            # every automated item below
node cli.mjs audit && node cli.mjs audit --engine=webkit
node cli.mjs perf                              # 1x numbers
node cli.mjs down && node cli.mjs up --ref=<sha> --prod --seed=.data/seed-5x.json && node cli.mjs perf --label=perf-<sha>-5x
node scan/static.mjs --ref=<sha>
node cli.mjs up --ref=<sha> --lan              # then the 📱 items, on a phone
```

Record each round as `baseline/<date>-<sha>.md` with the same item IDs. Status key: ✅ pass · ❌ fail · ⚠️ partly / judgment call · ⬜ not yet checked · 📱 real phone only.

Devices: **S** small 375×667 · **Sh** short 375×548 · **L** large 430×932 · **La** landscape 932×430 (see [devices.mjs](devices.mjs)).

---

## 1. State and continuity

| ID | Check | How | Devices | Baseline |
|---|---|---|---|---|
| SC-1 | Half-typed transaction survives backgrounding / switching apps | `trust.spec` "background" | S | ✅ |
| SC-2 | Half-typed transaction survives iOS reloading the app (memory pressure, long call) | `trust.spec` "reload/eviction" | S | ❌ amount comes back "0" |
| SC-3 | 📱 Same as SC-1/SC-2 on a phone: type an amount + note, take a call / open the camera for 2 min, come back | manual | real iPhone, installed | ⬜ |
| SC-4 | Relaunching the app returns to where I was (not always Overview) | manual; `start_url` in `public/manifest.json` | 📱 | ❌ always opens Overview (`start_url: "/"`, no last-route memory) |
| SC-5 | Back closes the top layer (sheet, detail) instead of leaving the page | `continuity.spec` "back closes…" ×2 | S | ❌ both leave the page |
| SC-6 | Back never exits the app when a layer is open | 📱 Android back / Safari edge swipe | 📱 | ⬜ (installed iOS app has no back gesture) |
| SC-7 | Scroll position is the same after opening a transaction and closing it | `continuity.spec` "scroll position" | S | ✅ (within 6px) |

## 2. Keyboard

_Broken before the rebuild — verify hard._ `keyboard.spec` draws a keyboard of the device's modeled height (full keyboard vs. numeric keypad, [devices.mjs](devices.mjs)) and reports it through a stand-in `visualViewport`, the way iOS does.

| ID | Check | How | Devices | Baseline |
|---|---|---|---|---|
| KB-1 | Add sheet, **Expense**: every field and the submit button visible with the keyboard up | `keyboard.spec` | S Sh L La | ❌ submit hidden on all; description field hidden on all |
| KB-2 | Add sheet, **Transfer**: same | `keyboard.spec` | S Sh L La | ❌ same |
| KB-3 | Add sheet, **Income**: same | `keyboard.spec` | S Sh L La | ❌ same |
| KB-4 | Numeric keypad (amount) tested separately from the full keyboard | `keyboard.spec` (per-input keypad height) | all | ❌ amount half-covered on S, L, La |
| KB-5 | No fixed pixel offsets used to dodge the keyboard | `scan/static.mjs` → `keyboard` | — | ✅ 0 found (nothing handles the keyboard at all — no `visualViewport` use) |
| KB-6 | No input smaller than 16px (iOS zooms the whole page on focus) | `layout.spec` "iOS zoom" | all | ❌ login fields, Settings token label, Add-sheet description in landscape |
| KB-7 | Every other input in the app (edit transaction, reconcile, calendar event, settings, budget editor) keeps field + action visible | 📱 manual; extend `keyboard.spec` as the rebuilt sheets land | 📱 S, Sh | ⬜ |
| KB-8 | 📱 Real keyboard on a real phone, short viewport (Safari with toolbars) | manual with `--lan` | 📱 | ⬜ |

## 3. Safe areas and spacing

| ID | Check | How | Devices | Baseline |
|---|---|---|---|---|
| SA-1 | Last element on every screen clears the nav **and** the home indicator (≥8px) | `layout.spec` "last thing on the page" | all | ❌ `/spending` (46–50px under the nav, every device), `/transactions`, `/spending/budget`, `/spending/recurring` |
| SA-2 | Last list row is tappable (not under the nav / home indicator) | `layout.spec` "nothing tappable is stuck" | all | ❌ Recurring last row (S), "Show past 11 months" (Sh) |
| SA-3 | Nothing readable under the status bar / notch | `layout.spec` "status bar" | S L | ✅ |
| SA-4 | Landscape: nothing under the side notch areas | screenshots (`shot all --device=landscape`) — no automated check yet | La | ⬜ |
| SA-5 | Never scrolls sideways; never loads already panned | `layout.spec` "never scrolls sideways" | all | ❌ Spending sub-tabs 460px wide → `/spending`, `/spending/budget`, `/spending/recurring`, `/transactions`, `/accounts`; `/spending` loads panned 85px |
| SA-6 | No text cut off | `layout.spec` "no text is cut off" | all | ❌ "Needs attention" banner clips its 2nd item on every portrait screen; `/recent` list clips 6px |
| SA-7 | Nothing floating covers content (chat button, FAB) | `audit` occlusion + screenshots | all | ⚠️ chat button covers row amounts on `/recent` |
| SA-8 | Viewport-height units: `dvh`/`svh`, never `100vh`/`h-screen` | `scan/static.mjs` → `viewport` | — | ❌ 7 (incl. `accounts/account-list.tsx:511`, `accounts/mortgage-card.tsx:351` `max-h-[90vh]`) |
| SA-9 | Both engines agree (Chromium with safe areas, WebKit without) | `audit` + `audit --engine=webkit` | all | ✅ same findings |

## 4. Network reality

| ID | Check | How | Devices | Baseline |
|---|---|---|---|---|
| NW-1 | **A retry after an ambiguous failure never creates a duplicate** | `trust.spec` "retry after drop-after-commit" | S | ❌ 2 rows |
| NW-2 | **Offline-queue replay of a save that actually landed never duplicates** | `trust.spec` "offline-queue replay" | S | ❌ 2 rows |
| NW-3 | Double-tapping Add on a slow connection saves once | `trust.spec` "double-tap" | S | ✅ |
| NW-4 | Logged with no signal (app already open): kept, shown as waiting, sent once when signal returns | `network.spec` | S | ✅ toast "saved, will send automatically", sends by itself, once |
| NW-5 | The installed app opens with no signal | `network.spec` "opens with no signal" | S | ❌ no service worker — browser error page |
| NW-6 | Slow connection (800ms ± 400ms): every primary action completes, with feedback while waiting | `node cli.mjs fault '{"latencyMs":800,"jitterMs":400}'` + walk the primary actions | S | ⬜ |
| NW-7 | Connection returns mid-request: no stuck spinners, no half-saved state | `fault` `drop` + `drop-after-commit` rules | S | ⚠️ covered for Add (NW-1/2); other saves ⬜ |
| NW-8 | Error messages are human ("Couldn't save — check your connection"), not raw | `trust.spec` output | S | ❌ shows "TypeError: fetch failed" |
| NW-9 | The app says when it's showing stale data | manual | S | ❌ no indicator anywhere |

## 5. Two people, two devices

| ID | Check | How | Devices | Baseline |
|---|---|---|---|---|
| TP-1 | Geralyn adds a transaction: when and how does Andru see it? | `two-people.spec` (measures) | S | ⚠️ "New activity · Reload" pill after **58s**; the row only appears after tapping Reload |
| TP-2 | Attribution on a new transaction is the right person | `two-people.spec` | S | ✅ |
| TP-3 | Attribution never shows the wrong person or "Unknown" when it's known | manual, rows with `created_by` but no email | S | ❌ `transaction-detail-modal.tsx:416` shows "Unknown" whenever the email is missing |
| TP-4 | Two people editing the same transaction: the second save doesn't silently overwrite the first | manual (two contexts) — automate in Phase 2 | S | ⬜ `updateTransaction` checks `updated_at`; other edit paths unverified |
| TP-5 | Two people editing the same budget line / account / event | manual | S | ⬜ |
| TP-6 | Presence ("who's online") | 📱 only — the QA mock has no Realtime | 📱 | ⬜ |

## 6. Data correctness

Expectations come from [lib/finance.mjs](lib/finance.mjs), an independent ledger over the raw tables — never from the app's own code.

| ID | Check | How | Devices | Baseline |
|---|---|---|---|---|
| DC-1 | **This month's spending is one number everywhere** | `data-correctness.spec` | L | ❌ $19,782.30 / $19,922.30 / $19,507.30 on three screens |
| DC-2 | **Over/under budget is one number everywhere** | `data-correctness.spec` | L | ❌ hero "−$9,047.30 left" vs breakdown "$8,632.30 over" |
| DC-3 | Every account balance matches the ledger | `data-correctness.spec` | L | ✅ |
| DC-4 | Net worth = cash + home equity | `data-correctness.spec` | L | ✅ |
| DC-5 | Budget tab headline = sum of its rows | `data-correctness.spec` | L | ✅ |
| DC-6 | **Card purchases never shown as "+" money in** | `data-correctness.spec` | L | ❌ "+$1,249.00" in green |
| DC-7 | **Pending-approval purchases: counted or not, consistently and visibly** | `data-correctness.spec` (fixme — needs your decision) | L | ❌ counted as spent everywhere, no indication |
| DC-8 | **Reconcile: gap = statement − app balance; fixing it lands exactly on the statement** | `reconcile.spec` | L | ✅ |
| DC-9 | **Reconcile correction is not counted as income or spending** | `reconcile.spec` | L | ❌ 3 of 4 directions change Monthly Income / Expenses; also adds to "needs a category" |
| DC-10 | Month boundaries: 11:40pm on the 31st, backdated entries, entries filed under another month | seed edge ids + DC-1 | L | ❌ (backdated $140 fee is the Overview vs Spending gap in DC-1) |
| DC-11 | Floats: no amount on any screen shows float noise or >2 decimals | `data-correctness.spec` "no amount anywhere…" | L | ✅ none on 8 screens |
| DC-12 | Refunds: to checking and on the card, both reduce spending | manual on seed refund rows — automate in Phase 2 | L | ⬜ card refund suspected ignored |
| DC-13 | Captions and pills are never wrong ("on pace" while over, "left" while negative) | manual read of every caption with seed data + DC-2 | L S | ⚠️ "Left to spend" goes hugely negative after a planned tax payment from savings |
| DC-14 | Calendar: same-day events in time order | `data-correctness.spec` | L | ❌ `lib/calendar.ts:37` sorts by date only |

## 7. Performance (seed data loaded)

`node cli.mjs perf` on a production build: small phone, CPU slowed 2×, 80ms backend latency, median of 3 cold loads. Re-run at 5× data.

| ID | Check | Budget | Baseline 1× | Baseline 5× |
|---|---|---|---|---|
| PF-1 | Cold start to interactive, Wi-Fi | < 1s | 52–108ms | 340–894ms |
| PF-2 | Cold start to interactive, Slow 4G | < 2.5s | 568–760ms | 740–2,509ms (`/transactions`) |
| PF-3 | Largest paint, Slow 4G | < 2.5s | ❌ 2.0–2.6s on `/balances`, `/recent`, `/add` | ❌ up to 2.8s |
| PF-4 | Server response (TTFB) stays flat as data grows | < 100ms | 13–39ms | ❌ 307–423ms on **every** screen |
| PF-5 | Transaction list renders only what's on screen (virtualized) | < 1,500 DOM nodes | ❌ 5,449 nodes | ❌ 23,723 nodes, 92ms blocking |
| PF-6 | Tab switch settles | < 100ms | 27–61ms | 40–63ms |
| PF-7 | Tap → next paint | < 100ms | 32–40ms | — |
| PF-8 | No table over Next's 2MB cache limit | log check | ✅ (under) | ❌ transactions 7.76MB — every load refetches the whole table |

## 8. Motion and feel

| ID | Check | How | Devices | Baseline |
|---|---|---|---|---|
| MF-1 | Every interactive element acknowledges on press, not release | 📱 manual (press and hold each control) | 📱 | ⬜ (tab bar prefetches on press) |
| MF-2 | No layout shift as content loads | `audit` CLS | all | ✅ 0.000 on every screen |
| MF-3 | No layout shift when filtering or when an error/toast appears | manual + `audit` after actions — automate in Phase 2 | S | ⬜ |
| MF-4 | Same durations/easing across all three agents' work (tokens, not literals) | `scan/static.mjs` → `motion` | — | 8 hardcoded (pre-token baseline) |
| MF-5 | Reduced motion: primary interactions don't animate movement | `motion.spec` | S | ⚠️ tab bar pill still slides 300ms |
| MF-6 | Reduced motion: everything still works | `motion.spec` + walk | S | ✅ |

## 9. One-handed use

| ID | Check | How | Devices | Baseline |
|---|---|---|---|---|
| OH-1 | Every tap target ≥ 44px | `layout.spec` "tap targets" | all | ❌ on every screen (banner links 40px, Dismiss 28px, Reconcile 55×24, calendar arrows 32px, Spending sub-tabs 32px tall, Add-sheet type toggle 32px) |
| OH-2 | Adjacent rows spaced so a thumb doesn't hit the neighbor (≥ 8px or ≥ 44px rows) | `audit` small-targets + screenshots | S L | ⚠️ `/transactions` rows ~85–100 small targets |
| OH-3 | 📱 Primary actions reachable by a right thumb on a large phone (bottom 60% of screen) | manual walk, L | 📱 L | ⬜ close (✕) and type toggle sit at the top of the Add sheet |
| OH-4 | Nothing important stranded at the top of the screen | manual walk with screenshots | L | ⬜ |

## 10. Cross-agent consistency

Only meaningful after the merge; baseline numbers are the "before" for comparison.

| ID | Check | How | Baseline |
|---|---|---|---|
| CA-1 | Hardcoded colors instead of tokens | `scan/static.mjs` → `tokens` | 54 |
| CA-2 | Hardcoded motion instead of tokens | `scan/static.mjs` → `motion` | 8 |
| CA-3 | Components duplicated locally instead of imported from the shared set | `scan/static.mjs` → `dupes` | 0 |
| CA-4 | Spacing and type drift between pages (page padding, heading sizes, row heights) | screenshots side by side (`shot all --device=small`) | ⬜ |
| CA-5 | Local stubs left where the real shared component should be | grep for `TODO`/`stub`/`placeholder` components after merge | ⬜ |
| CA-6 | Same concept, same component (money, dates, empty states, sheets) on every page | manual review against `components/ui` | ⬜ |

---

## Known limits of the rig

- No real keyboard, iOS toolbars, or PWA eviction in any emulator → the 📱 items, via `node cli.mjs up --lan`.
- Safe areas emulate in Chromium only; WebKit runs are a rendering cross-check.
- The QA mock has no Realtime, so presence can't be tested; freshness polling can.
- Keyboard heights are modeled (±20px). A pass in `keyboard.spec` is necessary, not sufficient.
