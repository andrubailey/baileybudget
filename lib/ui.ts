// Shared className constants for form-field-shaped inputs/selects/textareas.
// Before this, ~9 files each hand-copied their own version of these and
// drifted apart (missing `transition-colors`, `rounded-md` vs `rounded-lg`,
// `sm:text-xs` vs `sm:text-sm`, etc.) — import from here instead of
// redefining a local `fieldClass` constant.

// Standalone forms (Transaction form, Add account, Objectives, Quick Add) —
// roomy enough to tap comfortably, and text-base on mobile prevents iOS
// Safari's auto-zoom-on-focus.
export const FIELD_CLASS =
  "w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-base sm:text-sm sm:py-2 text-text outline-none transition-colors focus:border-accent";

// Inline/dense contexts — editing a value directly inside a table row or
// settings list, where the roomier FIELD_CLASS would blow out row height.
export const COMPACT_FIELD_CLASS =
  "w-full rounded-md border border-border bg-bg px-2 py-1.5 text-base sm:text-sm sm:py-1 text-text outline-none transition-colors focus:border-accent";

// A single narrow numeric cell inside a grid/table (budget planned-amount
// cells, per-category amount cells) — fixed width rather than full-width,
// so it doesn't stretch to fill its <td>.
export const COMPACT_NUMERIC_CELL_CLASS =
  "tabular w-24 rounded-md border border-border bg-bg px-2 py-1 text-sm text-text outline-none transition-colors focus:border-accent";
