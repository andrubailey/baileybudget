# Mobile shell & design system

Everything below is imported from **`@/components/ui`**. Tokens live in
**`app/tokens.css`** (CSS variables on `:root`). Try it all at
**`/ui-kit`** (dev server only, no sign-in).

## Rules for page code

- Don't render `<Screen>` or the bottom nav yourself. `app/(app)/layout.tsx`
  already wraps every page in `<Screen>` and renders `<BottomNav>`.
- Don't add bottom padding for the nav or home indicator. `<Screen>` owns it.
- Don't use `vh` for sizing. Use `dvh`.
- Use tokens, not raw values. With Tailwind, write `p-(--space-4)`,
  `rounded-(--radius-card)`, `bg-(--bg-card-subtle)` and
  `text-(length:--text-body)`. `docs/hardcoded-values.md` lists what's
  left to move (regenerate with `node scripts/audit-design-tokens.mjs`).
- Anything tappable that isn't one of these components: add `ui-pressable`
  for press feedback. Anything that appears after first paint: add
  `ui-enter`.

## Routes

`MOBILE_ROUTES`, in nav order. These are the app's existing mobile pages,
so nothing is stubbed.

| Tab | Path |
|---|---|
| Home | `/` |
| Money | `/budget` |
| Accounts | `/balances` |
| Activity | `/recent` |

`isActiveTab(href, pathname)` returns whether a tab is current.

## Tokens

| Group | Tokens |
|---|---|
| Spacing | `--space-1` 4 · `-2` 8 · `-3` 12 · `-4` 16 · `-5` 20 · `-6` 24 · `-7` 32 · `-8` 48 (px) |
| Radius | `--radius-card` 20px · `--radius-pill` 999px · `--radius-field` 12px |
| Color | `--bg-page` `--bg-card` `--bg-card-subtle` `--text-primary` `--text-secondary` `--text-tertiary` `--accent-positive` `--accent-caution` `--border-subtle` |
| Type (sizes) | `--text-display` 44px · `--text-title` 28px · `--text-body` 16px · `--text-label` 11px · `--text-caption` 13px · `--tracking-label` 0.08em |
| Type (roles) | `.ui-display` `.ui-title` `.ui-body` `.ui-label` `.ui-caption` `.ui-tabular` (weight, leading and tracking) |
| Motion | `--duration-fast` 120ms · `--duration-base` 200ms · `--duration-slow` 280ms · `--ease-out` · `--ease-in` |
| Shell | `--bottom-nav-height` 56px · `--bottom-nav-gap` · `--screen-bottom-clearance` · `--keyboard-inset` |

Colors alias the existing palette, so dark mode follows automatically.

## Components

**`<Screen children className?>`**: the page frame. It pads all four safe-area
edges, uses a `100dvh` minimum height, and leaves bottom clearance equal to
the home indicator + nav gap + nav height + `--space-6`. On desktop it uses
the desktop padding.

**`<PageHeader title subtitle? icon?>`**: a large title, one quiet line under
it, and an optional right slot (one ~44px icon button).

**`<HeroCard label value caption? status? children?>`**
- `value: number | null`: dollars render large and cents smaller. `null`
  shows a placeholder at the same height, so nothing jumps when the number
  loads.
- `status: { label, tone }`: a pill in the top right.
- `children`: slot for a thin progress bar or sparkline.

**`<SectionHeader title action?>`**: `action: { label, href? | onPress? }`
is the quiet link on the right.

**`<Row leading? title subtitle? value? valueCaption? href? onPress?>`**:
`value` given as a number renders as money; anything else renders as given.
Amounts are right-aligned with tabular figures. The row is tappable only
when `href` or `onPress` is set.

**`<ProgressRow icon? name spent limit caption? tone? href? onPress?>`**
- Shows "$spent of $limit" and a thin full-width bar.
- The bar grows with `transform: scaleX` (transform only).
- `caption` renders in all caps.
- `tone` is `"positive" | "caution" | "neutral"`. Default: caution at 90%
  or more of the limit, positive otherwise.

**`<StatusPill tone? children>`**: `tone` is
`"positive" | "caution" | "neutral"` (default neutral).

**`<Avatar initial label? size?>`**: `label` is the screen-reader name
(e.g. "Andru"); `size` is `"sm" | "md"`.

**`<Sheet open onClose title children footer? initialFocus?>`**
- A controlled bottom sheet: drag handle (drag down to close), title row
  with a Close button, and a scrollable body.
- **`footer`** is pinned below the body. Put the submit button there so it
  stays visible above the keyboard.
- Rides on top of the keyboard and keeps the focused field scrolled into
  view.
- **`initialFocus`** takes a ref to the field to focus on open (e.g. the
  amount). Without it, the panel takes focus unless a field already has it.
  Don't focus fields yourself with a `setTimeout`.
- Escape closes it; focus returns to whatever opened it; page scroll is
  locked while it's open.
- `onClose` can be a new function every render; the sheet won't re-focus
  or re-run its setup because of it.
- It stays mounted through its exit animation.

**`<BottomNav surface? routes? onAdd addDisabled? addLabel? addKeyboard? notifications? extras? secondaryAction?>`**
- Four icon-only tabs; the active one sits in a gray pill.
- `notifications: { count, onPress }` adds a bell after the tabs, with a
  badge when `count` is above zero. The app's bell opens the notifications
  sidebar (`app/(app)/notifications.tsx`).
- A dark pill on the right holds "+" (`onAdd`).
- `addKeyboard` (`"decimal" | "numeric" | "text"`) raises that keyboard
  during the "+" tap itself (see `primeKeyboard`). The app passes
  `"decimal"` because the add sheet opens on its amount field.
- `secondaryAction` is the reserved empty slot for a future voice-entry
  button. Pass a `<button className="ui-bottom-nav-action ui-pressable">`
  to fill it.
- Hidden while the keyboard is open.
- `surface` (`"phone" | "desktop"`) sets which width it shows at. The phone
  instance is `app/(app)/mobile-bottom-nav.tsx`, where "+" opens the add
  sheet. The desktop instance is in `app/(app)/sidebar.tsx`: `routes` points
  it at `DESKTOP_ROUTES` and `extras` adds Search and the account menu.

**`primeKeyboard(inputMode)`**: call it synchronously inside a tap handler
that opens something whose first field should get the keyboard. iOS only
raises the keyboard when focus happens during the tap, so this focuses a
hidden input then. The real field (via `Sheet`'s `initialFocus`) takes
over, and iOS keeps the keyboard up and switches it to that field's type.

**`useKeyboardInset(): number`**: how many px the on-screen keyboard
covers, read from `visualViewport` (resize + scroll), not from window
resize. It returns 0 with no keyboard.

**`formatMoney(value, { cents? })` / `splitMoney(value)`**: the currency
helpers the components use.

## Motion

- Press feedback fires on `:active`, which is on press, not release.
  iOS only applies `:active` when the page has a touch listener, so
  `BottomNav` registers one.
- Sheets and banners enter and exit using transform and opacity only.
- Nothing is longer than `--duration-slow` (280ms), and neither easing
  curve overshoots.
- `prefers-reduced-motion` collapses every duration to 1ms, and the sheet
  fades instead of sliding.

## Changes from the spec

1. **Component location.** Components live in `@/components/ui`. The app
   already had a `PageHeader` (`title`/`description`/`actions`) and a
   `StatusPill` (`variant`) that pages still import, so the new ones sit
   alongside rather than replacing them. Migrate page imports as you go.
2. **Routes.** Routes reuse the existing paths above rather than new
   `/money` and `/activity` URLs.
3. **Top bar removed on phones.** The "Bailey Budget" top bar is gone on
   phones, because `<Screen>` now owns the top safe area. It also held the
   "who's online" dot; that still shows on the desktop sidebar but not on
   phones. `PageHeader`'s `icon` slot could host it.
4. **Spacing values.** The spec fixed only `--space-1` (4) and `--space-8`
   (48). The steps between are 8/12/16/20/24/32.
5. **Type tokens are sizes only.** Weight and tracking live in the `.ui-*`
   role classes. `--tracking-label` was added.
6. **App-wide duration changes.** `--duration-fast` (150ms → 120ms) and
   `--duration-slow` (300ms → 280ms) now apply everywhere.
   - `--duration-instant` (100ms) is kept for existing code.
   - `--safe-bottom`, `--mobile-tabbar-h` and `--content-bottom-safe` are
     kept as aliases onto the new shell tokens.
7. **Additions.** `Sheet` gained a `footer` slot, which is how the submit
   action stays visible above the keyboard. `BottomNav` also hides itself
   while the keyboard is open.
8. **Dark mode "+" pill.** It uses `--text-primary`, so it becomes light in
   dark mode (still the highest-contrast element).
9. **Keyboard testing was simulated only.** I overrode `visualViewport` at
   216px (numeric keypad) and 291px (full keyboard). In both, the sheet's
   bottom landed exactly on the keyboard's top, the focused field and
   footer stayed visible, and the nav hid. Real-device or iOS Simulator
   testing is still pending: the Simulator needs a full Xcode install.
10. **Not changed: the existing add sheet.** `MobileAddSheet` (the "+" flow)
    is a feature component, so it isn't rebuilt on `<Sheet>` yet.
11. **Not changed: long existing animations.** The longer chart-reveal and
    confetti animations in `globals.css` are listed under "motion" in
    `docs/hardcoded-values.md`.
