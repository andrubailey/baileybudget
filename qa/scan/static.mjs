#!/usr/bin/env node
// Static checks over the app source at any git ref — things that are
// defects even when the screen currently looks right:
//
//  keyboard   fixed pixel offsets used to dodge the on-screen keyboard
//             (keyboard heights differ by device, orientation, and numeric
//             vs. full keyboard; only visualViewport-driven insets hold up)
//  viewport   100vh / h-screen (on iOS that's taller than the visible area
//             whenever toolbars show) where dvh/svh was meant
//  motion     hardcoded durations/easings instead of the motion tokens
//  tokens     hardcoded hex colors in components instead of color tokens
//  dupes      local copies of shared UI primitives (for the cross-agent seam
//             check once components/ui exists)
//
//   node scan/static.mjs [--ref=HEAD] [--only=keyboard,viewport,...] [--out=artifacts/scan-<ref>.md]
//
// Reads files straight from git (`git show <ref>:<path>`), so it never
// touches the working tree the other agents are editing.

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const QA_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APP_ROOT = resolve(QA_ROOT, "..");
const flags = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));
const ref = flags.ref ?? "HEAD";
const only = flags.only ? new Set(flags.only.split(",")) : null;
const git = (...args) => execFileSync("git", ["-C", APP_ROOT, ...args], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });

const files = git("ls-tree", "-r", "--name-only", ref, "--", "app", "components", "lib")
  .split("\n")
  .filter((f) => /\.(tsx?|css)$/.test(f) && !f.includes("/api/"));

const RULES = [
  {
    id: "keyboard",
    why: "fixed pixel offset near keyboard/viewport handling — breaks on a different keyboard height (numeric keypad, landscape, other devices)",
    test: (line, ctx) =>
      /(keyboard|visualViewport|virtualKeyboard|keyboard-inset)/i.test(ctx) &&
      /(\b(bottom|paddingBottom|marginBottom|translateY|height|maxHeight|minHeight)\s*[:(=]\s*["'`]?-?\d{2,}(px)?["'`]?\s*[,;)}]|[pm]b-\[\d{2,}px\]|bottom-\[\d{2,}px\]|h-\[calc\([^\]]*-\s*\d{2,}px|(innerHeight|clientHeight)\s*[-+]\s*\d{2,})/.test(line),
  },
  {
    id: "viewport",
    why: "100vh/h-screen is taller than the visible area on iOS whenever the toolbars show — use dvh/svh",
    test: (line) => /(\b100vh\b|\bh-screen\b|\bmin-h-screen\b|\bmax-h-screen\b|\bh-\[100vh\]|\b\d+vh\b)/.test(line) && !/dvh|svh|lvh/.test(line),
  },
  {
    id: "motion",
    why: "hardcoded animation timing instead of the --duration-*/--ease-* motion tokens",
    test: (line, _ctx, file) =>
      !file.endsWith("globals.css") &&
      !file.endsWith("tokens.css") &&
      (/duration-\[\d+m?s\]|ease-\[cubic-bezier|transition(-duration)?\s*:\s*[^;]*\d+m?s|animation\s*:\s*[^;]*\d+m?s/.test(line) || /setTimeout\([^,]+,\s*(1[2-9]\d|[2-9]\d\d)\)/.test(line)),
  },
  {
    id: "tokens",
    why: "hardcoded color in a component instead of a color token",
    test: (line, _ctx, file) => !file.endsWith(".css") && /#[0-9a-fA-F]{6}\b|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+/.test(line) && !/\/\/|\*/.test(line.trim().slice(0, 2)),
  },
];

const findings = [];
for (const file of files) {
  let src;
  try {
    src = git("show", `${ref}:${file}`);
  } catch {
    continue;
  }
  const lines = src.split("\n");
  lines.forEach((line, i) => {
    const ctx = lines.slice(Math.max(0, i - 12), i + 12).join("\n");
    for (const rule of RULES) {
      if (only && !only.has(rule.id)) continue;
      if (rule.test(line, ctx, file)) findings.push({ rule: rule.id, file, line: i + 1, code: line.trim().slice(0, 160) });
    }
  });
}

// Duplicated primitives: the same component name exported from more than one file.
const exportsByName = new Map();
for (const file of files.filter((f) => f.endsWith(".tsx"))) {
  let src;
  try {
    src = git("show", `${ref}:${file}`);
  } catch {
    continue;
  }
  for (const m of src.matchAll(/export function ([A-Z][A-Za-z]+)/g)) {
    exportsByName.set(m[1], [...(exportsByName.get(m[1]) ?? []), file]);
  }
}
const dupes = [...exportsByName].filter(([, fs]) => fs.length > 1);
if (!only || only.has("dupes")) for (const [name, fs] of dupes) findings.push({ rule: "dupes", file: fs.join(", "), line: 0, code: `export function ${name} — defined ${fs.length} times` });

const byRule = Object.groupBy ? Object.groupBy(findings, (f) => f.rule) : findings.reduce((m, f) => ((m[f.rule] ??= []).push(f), m), {});
const md = [`# Static scan — ${ref}`, "", `${files.length} files under app/, components/, lib/ (API routes excluded).`, ""];
for (const rule of [...RULES.map((r) => r.id), "dupes"]) {
  const list = byRule[rule] ?? [];
  const why = RULES.find((r) => r.id === rule)?.why ?? "the same component exported from more than one file — one should import the other";
  md.push(`## ${rule} — ${list.length}`, "", `_${why}_`, "");
  for (const f of list.slice(0, 60)) md.push(`- \`${f.file}${f.line ? `:${f.line}` : ""}\` — \`${f.code.replace(/`/g, "'")}\``);
  if (list.length > 60) md.push(`- …and ${list.length - 60} more`);
  md.push("");
}
const out = resolve(QA_ROOT, flags.out ?? `artifacts/scan-${ref.replace(/[^\w.-]/g, "_")}.md`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, md.join("\n"));
for (const rule of [...RULES.map((r) => r.id), "dupes"]) console.log(`${rule.padEnd(9)} ${(byRule[rule] ?? []).length}`);
console.log(`Wrote ${out}`);
