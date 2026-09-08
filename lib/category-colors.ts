// A category's color used to depend on its rank by spend this period, so the
// same category could shift color between "This month" and "Year to date."
// Hashing the id into a fixed palette keeps one category one color everywhere.
// Five quiet, closely-related tones rather than a ten-color wheel — the
// name and icon are what actually identify a category; the dot only needs
// to be different enough from its neighbors to scan, not to shout. A bit
// more saturated than the first pass so the dot itself reads at a glance
// (that's its whole job, at this size) instead of needing a second look.
const PALETTE = [
  "#2e8f63",
  "#a17a2e",
  "#2e6f8f",
  "#9c2e63",
  "#7a9c2e",
];

export function getCategoryColor(categoryId: string): string {
  let hash = 0;
  for (let i = 0; i < categoryId.length; i++) {
    hash = (hash * 31 + categoryId.charCodeAt(i)) | 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}
