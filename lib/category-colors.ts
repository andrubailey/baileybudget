// A category's color used to depend on its rank by spend this period, so the
// same category could shift color between "This month" and "Year to date."
// Hashing the id into a fixed palette keeps one category one color everywhere.
// Vivid, fully-saturated tones rather than the muted earlier pass — the dot
// and icon are meant to pop at a glance, not read as a quiet accent, so
// these sit in the same bright range most icon systems use on a light
// background instead of a dialed-back "safe" version of each hue.
const PALETTE = [
  "#22c55e",
  "#f59e0b",
  "#3b82f6",
  "#ec4899",
  "#84cc16",
  "#f97316",
  "#8b5cf6",
  "#14b8a6",
];

export function getCategoryColor(categoryId: string): string {
  let hash = 0;
  for (let i = 0; i < categoryId.length; i++) {
    hash = (hash * 31 + categoryId.charCodeAt(i)) | 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}
