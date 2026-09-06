// A category's color used to depend on its rank by spend this period, so the
// same category could shift color between "This month" and "Year to date."
// Hashing the id into a fixed palette keeps one category one color everywhere.
const PALETTE = [
  "#9e77ed",
  "#f04438",
  "#0ba5ec",
  "#17b26a",
  "#4e5ba6",
  "#f79009",
  "#ee46bc",
  "#2e90fa",
  "#66c61c",
  "#e04f16",
];

export function getCategoryColor(categoryId: string): string {
  let hash = 0;
  for (let i = 0; i < categoryId.length; i++) {
    hash = (hash * 31 + categoryId.charCodeAt(i)) | 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}
