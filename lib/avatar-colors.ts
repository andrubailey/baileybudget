// Pastel background + matching dark text per row so transaction/person
// avatars read as colorful "photo" chips (per the reference design) instead
// of a single flat gray circle, while staying stable per row via a hash.
const PALETTE: [bg: string, text: string][] = [
  ["#fce7f3", "#9d174d"],
  ["#fef3c7", "#92400e"],
  ["#dbeafe", "#1e40af"],
  ["#dcfce7", "#166534"],
  ["#ede9fe", "#5b21b6"],
  ["#ffe4e6", "#9f1239"],
  ["#e0f2fe", "#075985"],
  ["#fae8ff", "#86198f"],
];

export function getAvatarColors(seed: string): { bg: string; text: string } {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const [bg, text] = PALETTE[Math.abs(hash) % PALETTE.length];
  return { bg, text };
}
