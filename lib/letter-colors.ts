// One color per starting letter (not a hash of the row, like avatar-colors)
// so every transaction beginning with the same letter reads as the same
// color at a glance — "all the A's are this blue" — instead of a scattered
// per-row palette.
const LETTER_PALETTE: Record<string, [bg: string, text: string]> = {
  A: ["#fee2e2", "#991b1b"],
  B: ["#ffedd5", "#9a3412"],
  C: ["#fef3c7", "#92400e"],
  D: ["#fef9c3", "#854d0e"],
  E: ["#ecfccb", "#3f6212"],
  F: ["#dcfce7", "#166534"],
  G: ["#d1fae5", "#065f46"],
  H: ["#ccfbf1", "#115e59"],
  I: ["#cffafe", "#155e75"],
  J: ["#e0f2fe", "#075985"],
  K: ["#dbeafe", "#1e40af"],
  L: ["#e0e7ff", "#3730a3"],
  M: ["#ede9fe", "#5b21b6"],
  N: ["#f3e8ff", "#6b21a8"],
  O: ["#fae8ff", "#86198f"],
  P: ["#fce7f3", "#9d174d"],
  Q: ["#ffe4e6", "#9f1239"],
  R: ["#fee2e2", "#7f1d1d"],
  S: ["#ffedd5", "#7c2d12"],
  T: ["#fef3c7", "#78350f"],
  U: ["#ecfccb", "#365314"],
  V: ["#dcfce7", "#14532d"],
  W: ["#ccfbf1", "#134e4a"],
  X: ["#cffafe", "#164e63"],
  Y: ["#dbeafe", "#1e3a8a"],
  Z: ["#e0e7ff", "#312e81"],
};
const FALLBACK: [string, string] = ["#e5e7eb", "#374151"];

export function getLetterColors(seed: string): { bg: string; text: string } {
  const letter = seed.trim()[0]?.toUpperCase() ?? "";
  const [bg, text] = LETTER_PALETTE[letter] ?? FALLBACK;
  return { bg, text };
}
