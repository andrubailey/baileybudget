// Lists every hardcoded spacing, radius, color and font-size value in the
// app so page/feature code can be moved onto the tokens in app/tokens.css.
// Read-only. Re-run any time:  node scripts/audit-design-tokens.mjs
// Writes docs/hardcoded-values.md.
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCAN = ["app", "lib"];
const SKIP = [/^app\/tokens\.css$/, /^components\/ui\//, /^app\/ui-kit\//, /\.d\.ts$/];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(tsx?|css)$/.test(name)) out.push(path);
  }
  return out;
}

const pre = "(?<![\\w-])(?:[a-z0-9-]+:)*";
const SPACE_KEYS =
  "-?(?:p|px|py|pt|pr|pb|pl|ps|pe|m|mx|my|mt|mr|mb|ml|ms|me|gap|gap-x|gap-y|space-x|space-y|inset|inset-x|inset-y|top|right|bottom|left)";
const PALETTE =
  "(?:white|black|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\\d{2,3})";

const RULES = {
  spacing: [
    new RegExp(`${pre}${SPACE_KEYS}-(\\d+(?:\\.\\d+)?|px|\\[[^\\]]+\\])(?![\\w-])`, "g"),
    /(?:padding|margin|gap|inset)[\w-]*:\s*[^;{}]*?-?\d*\.?\d+(?:px|rem)/g,
    /\b(?:padding|margin|gap)\w*:\s*["'`]?[^,}\n]*?\d+(?:px|rem)/g,
  ],
  radius: [
    new RegExp(
      `${pre}rounded(?:-(?:t|r|b|l|tl|tr|br|bl|s|e|ss|se|es|ee))?(?:-(?:none|xs|sm|md|lg|xl|2xl|3xl|4xl|full|\\[[^\\]]+\\]))?(?![\\w(-])`,
      "g",
    ),
    /border-radius:\s*[^;]+/g,
    /\bborderRadius:\s*[^,}\n]+/g,
  ],
  "font-size": [
    new RegExp(`${pre}text-(?:xs|sm|base|lg|xl|[2-9]xl|\\[[\\d.]+(?:px|rem|em)\\])(?![\\w-])`, "g"),
    /font-size:\s*[^;]+/g,
    /\bfontSize:\s*[^,}\n]+/g,
  ],
  // Motion over the 300ms ceiling, or animations that bounce/loop.
  motion: [
    new RegExp(`${pre}duration-(?:[4-9]\\d{2}|\\d{4,})(?![\\w-])`, "g"),
    /(?<![\w-])(?:[3-9]\d{2}|\d{4,})ms\b/g,
    /(?<![\w.-])(?:0?\.[4-9]\d*|[1-9]\d*(?:\.\d+)?)s\b(?=[^;]*(?:ease|linear|cubic|infinite|forwards|both))/g,
    new RegExp(`${pre}animate-(?:bounce|pulse|ping)(?![\\w-])`, "g"),
  ],
  color: [
    /#[0-9a-fA-F]{3,8}\b/g,
    /\b(?:rgba?|hsla?)\([^)]*\)/g,
    new RegExp(
      `${pre}(?:bg|text|border|ring|fill|stroke|from|via|to|outline|decoration|divide|accent|caret|placeholder)-${PALETTE}(?:\\/\\d+)?(?![\\w-])`,
      "g",
    ),
  ],
};

// Nearest-token suggestions.
const SPACE_PX = [4, 8, 12, 16, 20, 24, 32, 48];
function spaceToken(twValue) {
  const px = Number(twValue) * 4;
  if (!Number.isFinite(px) || px === 0) return "";
  const i = SPACE_PX.reduce((best, v, j) => (Math.abs(v - px) < Math.abs(SPACE_PX[best] - px) ? j : best), 0);
  return `--space-${i + 1}${SPACE_PX[i] === px ? "" : ` (≈${px}px)`}`;
}
function suggest(category, match) {
  const m = match.replace(/^(?:[a-z0-9-]+:)*/, "");
  if (category === "spacing") {
    const v = m.match(/-(\d+(?:\.\d+)?)$/);
    return v ? spaceToken(v[1]) : "--space-*";
  }
  if (category === "radius") {
    if (/full/.test(m)) return "--radius-pill";
    if (/(?:2xl|3xl|4xl)/.test(m)) return "--radius-card";
    if (/(?:lg|xl|md)/.test(m)) return "--radius-field";
    return "--radius-*";
  }
  if (category === "font-size") {
    if (/text-xs/.test(m)) return "--text-caption / --text-label";
    if (/text-(?:sm|base)/.test(m)) return "--text-body";
    if (/text-(?:lg|xl|2xl)/.test(m)) return "--text-title";
    if (/text-[3-9]xl/.test(m)) return "--text-display";
    return "--text-*";
  }
  if (category === "motion") {
    if (/300ms/.test(m)) return "--duration-slow (280ms)";
    return /animate-/.test(m) ? "remove, or a single --duration-* fade" : "--duration-slow or less";
  }
  if (category === "color") {
    if (/white/.test(m)) return "--bg-card";
    if (/black/.test(m)) return "--text-primary";
    return "--bg-* / --text-* / --accent-*";
  }
  return "";
}

const findings = { spacing: [], radius: [], "font-size": [], color: [], motion: [] };
for (const dir of SCAN) {
  for (const file of walk(join(ROOT, dir))) {
    const rel = relative(ROOT, file);
    if (SKIP.some((re) => re.test(rel))) continue;
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;
      for (const [category, patterns] of Object.entries(RULES)) {
        const seen = new Set();
        for (const re of patterns) {
          for (const m of line.matchAll(re)) {
            const value = m[0].trim();
            if (value.includes("var(--") || seen.has(value)) continue;
            seen.add(value);
            findings[category].push({ file: rel, line: i + 1, value, suggestion: suggest(category, value) });
          }
        }
      }
    });
  }
}

let md = `# Hardcoded design values\n\nGenerated by \`node scripts/audit-design-tokens.mjs\` — re-run after migrating a file.\nEach entry is \`file:line — value → suggested token\`. Suggestions are the nearest token, not a guaranteed 1:1 match; check visually.\n\nNot flagged: anything already using \`var(--…)\`, \`components/ui/\`, \`app/tokens.css\`, and comment lines. The palette definitions at the top of \`app/globals.css\` are listed too — they are the source the color tokens alias, so leave them unless the palette itself changes.\n\n## Summary\n\n| Category | Occurrences | Files |\n|---|---|---|\n`;
for (const [category, list] of Object.entries(findings)) {
  md += `| ${category} | ${list.length} | ${new Set(list.map((f) => f.file)).size} |\n`;
}
for (const [category, list] of Object.entries(findings)) {
  md += `\n## ${category}\n`;
  const byFile = new Map();
  for (const f of list) byFile.set(f.file, [...(byFile.get(f.file) ?? []), f]);
  for (const [file, entries] of [...byFile].sort((a, b) => b[1].length - a[1].length)) {
    md += `\n### ${file} (${entries.length})\n\n`;
    for (const e of entries) md += `- ${e.line} — \`${e.value}\`${e.suggestion ? ` → ${e.suggestion}` : ""}\n`;
  }
}

mkdirSync(join(ROOT, "docs"), { recursive: true });
writeFileSync(join(ROOT, "docs/hardcoded-values.md"), md);
console.log(
  Object.entries(findings)
    .map(([c, l]) => `${c}: ${l.length} in ${new Set(l.map((f) => f.file)).size} files`)
    .join("\n"),
);
