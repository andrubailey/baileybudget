// A category's color used to depend on its rank by spend this period, so the
// same category could shift color between "This month" and "Year to date."
// Hashing the id into a fixed palette keeps one category one color everywhere.
// Ten hues rotated at roughly constant muted chroma/lightness (matching the
// accent's desaturated character) instead of a mixed-brightness categorical
// kit — a real designed palette keeps saturation and value consistent and
// varies hue, rather than throwing together whatever bright colors were on
// hand.
const PALETTE = [
  "#6b7f3f",
  "#a3492f",
  "#3f6e7d",
  "#8f6b3f",
  "#6b5490",
  "#4a7a5f",
  "#9c6b1f",
  "#5f6b8f",
  "#8f4a6b",
  "#7a8f4a",
];

export function getCategoryColor(categoryId: string): string {
  let hash = 0;
  for (let i = 0; i < categoryId.length; i++) {
    hash = (hash * 31 + categoryId.charCodeAt(i)) | 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}
