#!/usr/bin/env node
// One entry point for the mobile QA stack. Run from qa/:
//
//   node cli.mjs up [--ref=HEAD] [--port=3200] [--seed=.data/seed.json] [--prod] [--lan]
//   node cli.mjs down
//   node cli.mjs status
//   node cli.mjs shot <path>... [--device=small|short|large|landscape|all] [--engine=chromium|webkit] [--as=andru|geralyn]
//   node cli.mjs audit [<path>...] [--device=all] [--engine=chromium] [--label=name]
//   node cli.mjs reset [--seed=.data/seed-5x.json]
//   node cli.mjs fault '{"latencyMs":800}'        # or: node cli.mjs fault off

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DEVICES, applySafeArea, contextOptions } from "./devices.mjs";
import { SCREENS, slug } from "./screens.mjs";
import { QA_ROOT, authStatePath, down, readState, up } from "./lib/stack.mjs";
import { HIDE_DEV_OVERLAY, auditScreen } from "./lib/audit.mjs";
import { PERF_DEVICE, measureColdLoad, measureTabSwitches, measureTap } from "./lib/perf.mjs";

const [command, ...rest] = process.argv.slice(2);
const flags = Object.fromEntries(rest.filter((a) => a.startsWith("--")).map((a) => {
  const [k, v] = a.slice(2).split("=");
  return [k, v ?? "true"];
}));
const positional = rest.filter((a) => !a.startsWith("--"));

function requireStack() {
  const state = readState();
  if (!state) {
    console.error("The QA stack isn't running. Start it with: node cli.mjs up");
    process.exit(1);
  }
  return state;
}

function pickDevices() {
  const d = flags.device ?? "all";
  return d === "all" ? Object.keys(DEVICES) : d.split(",");
}

function pickScreens() {
  if (!positional.length || positional[0] === "all") return SCREENS.map((s) => ({ ...s, slug: slug(s.path) }));
  return positional.map((p) => ({ ...(SCREENS.find((s) => s.path === p) ?? { path: p, label: p }), slug: slug(p) }));
}

async function launch(engine) {
  const pw = await import("@playwright/test");
  if (!pw[engine]) throw new Error(`Unknown engine "${engine}" (chromium or webkit)`);
  return pw[engine].launch();
}

async function shot() {
  const state = requireStack();
  const engine = flags.engine ?? "chromium";
  const user = flags.as ?? "andru";
  const browser = await launch(engine);
  const outRoot = resolve(QA_ROOT, "artifacts", "shots");
  try {
    for (const device of pickDevices()) {
      for (const screen of pickScreens()) {
        const context = await browser.newContext({ ...contextOptions(device), baseURL: state.appUrl, storageState: screen.auth === false ? undefined : authStatePath(state.port, user) });
        await context.addInitScript(HIDE_DEV_OVERLAY);
        const page = await context.newPage();
        if (engine === "chromium") await applySafeArea(page, device);
        await page.goto(screen.path, { waitUntil: "load", timeout: 180000 });
        await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
        const dir = resolve(outRoot, device);
        mkdirSync(dir, { recursive: true });
        await page.screenshot({ path: resolve(dir, `${screen.slug}-top.png`) });
        await page.screenshot({ path: resolve(dir, `${screen.slug}-full.png`), fullPage: true });
        console.log(`${device.padEnd(10)} ${screen.path.padEnd(22)} → ${resolve(dir, `${screen.slug}-top.png`)}`);
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}

function summarize(results, meta) {
  const lines = [];
  lines.push(`# Mobile audit — ${meta.label}`, "");
  lines.push(`Ref \`${meta.ref}\` (${meta.sha.slice(0, 10)}), engine ${meta.engine}, ${meta.mode}, seed as-of ${meta.asOf} (${meta.liveTransactions} live transactions). Generated ${meta.at}.`, "");
  lines.push("| Screen | Device | HTTP | Load ms | LCP | CLS | Overflow-x | Bottom clearance | Occluded taps | Clipped text | <44px targets | iOS-zoom inputs | Console errors |");
  lines.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const r of results) {
    if (r.error) {
      lines.push(`| ${r.screen} | ${r.device} | — | — | — | — | — | — | — | — | — | — | **nav failed: ${r.error}** |`);
      continue;
    }
    const clearance = r.bottomClearance ? `${r.bottomClearance.clearancePx}px${r.bottomClearance.clearancePx < 8 ? " ⚠" : ""}` : "—";
    lines.push(
      `| ${r.screen}${r.redirected ? ` → ${r.finalPath}` : ""} | ${r.device} | ${r.status} | ${r.loadMs} | ${r.perf?.lcp ?? "—"} | ${r.perf ? r.perf.cls.toFixed(3) : "—"}${r.perf && r.perf.cls > 0.1 ? " ⚠" : ""} | ${r.overflowX > 1 ? `${r.overflowX}px ⚠${r.loadedPannedX > 0 ? `, loads panned ${r.loadedPannedX}px` : ""}` : "0"} | ${clearance} | ${r.occluded.length ? `${r.occluded.length} ⚠` : "0"} | ${r.clippedText?.length ? `${r.clippedText.length} ⚠` : "0"} | ${r.smallTargets.length} | ${r.zoomOnFocusInputs.length} | ${r.consoleErrors.length}${r.failedRequests.length ? ` (+${r.failedRequests.length} failed req)` : ""} |`,
    );
  }
  lines.push("", "## Details", "");
  for (const r of results) {
    const issues = [];
    if (r.error) issues.push(`- Navigation failed: ${r.error}`);
    if (r.overflowX > 1) issues.push(`- Page is ${r.overflowX}px wider than the phone, so it scrolls sideways${r.loadedPannedX > 0 ? ` — and it LOADS already panned ${r.loadedPannedX}px to the side` : ""}. Culprits: ${(r.overflowCulprits ?? []).map((c) => `${c.el} in ${c.parent} (right edge ${c.right}px)`).join("; ")}`);
    if (r.bottomClearance && r.bottomClearance.clearancePx < 8) issues.push(`- Last element ${r.bottomClearance.lastElement} ends at ${r.bottomClearance.bottom}px; the floor (nav top / home indicator) is ${r.bottomClearance.floor}px → ${r.bottomClearance.clearancePx}px of room.`);
    for (const o of r.occluded ?? []) issues.push(`- With the page scrolled to the bottom, ${o.el} (${o.top}–${o.bottom}px) is ${o.reason}.`);
    for (const c of r.clippedText ?? []) issues.push(`- Text cut off with no ellipsis: ${c.el} shows ${c.visibleHeight}px of ${c.contentHeight}px.`);
    if (r.underStatusBar?.length) issues.push(`- Content under the status bar at scroll 0: ${r.underStatusBar.map((u) => `${u.el} @${u.top}px`).join("; ")}`);
    if (r.zoomOnFocusInputs?.length) issues.push(`- ${r.zoomOnFocusInputs.length} input(s) under 16px — iOS zooms the page on focus: ${r.zoomOnFocusInputs.slice(0, 4).map((z) => `${z.el} (${z.fontSize}px)`).join("; ")}`);
    if (r.smallTargets?.length) issues.push(`- ${r.smallTargets.length} tap target(s) under 44px, e.g. ${r.smallTargets.slice(0, 6).map((s) => `${s.el} ${s.w}×${s.h}`).join("; ")}`);
    if (r.perf?.shifts?.length && r.perf.cls > 0.02) issues.push(`- Layout shifts during load (CLS ${r.perf.cls.toFixed(3)}): ${r.perf.shifts.slice(0, 4).map((s) => `${s.value} @${s.t}ms [${s.nodes.join(", ")}]`).join("; ")}`);
    if (r.perf?.longTasks?.length) issues.push(`- Long tasks on the main thread: ${r.perf.longTasks.slice(0, 5).map((t) => `${t.ms}ms @${t.t}`).join(", ")}`);
    for (const e of r.consoleErrors ?? []) issues.push(`- Console: ${e}`);
    for (const f of r.failedRequests ?? []) issues.push(`- Request: ${f}`);
    if (issues.length) lines.push(`### ${r.screen} @ ${r.device}`, "", ...issues, "");
  }
  return lines.join("\n");
}

async function audit() {
  const state = requireStack();
  const engine = flags.engine ?? "chromium";
  const label = flags.label ?? `${state.ref === "HEAD" ? "head" : state.ref}-${state.sha.slice(0, 7)}${state.prod ? "-prod" : "-dev"}`;
  const outDir = resolve(QA_ROOT, "artifacts", label);
  const browser = await launch(engine);
  const results = [];
  try {
    for (const screen of pickScreens()) {
      for (const device of pickDevices()) {
        const r = await auditScreen({ browser, engine, device, appUrl: state.appUrl, storageState: authStatePath(state.port, flags.as ?? "andru"), screen, outDir: resolve(outDir, device) });
        results.push(r);
        const flagsOut = [r.error && "NAV-FAIL", r.overflowX > 1 && "overflow", r.bottomClearance?.clearancePx < 8 && "clearance", r.occluded?.length && `${r.occluded.length} occluded`, r.consoleErrors?.length && `${r.consoleErrors.length} errors`].filter(Boolean);
        console.log(`${screen.path.padEnd(22)} ${device.padEnd(10)} ${String(r.loadMs).padStart(6)}ms  ${flagsOut.join(", ") || "ok"}`);
      }
    }
  } finally {
    await browser.close();
  }
  const seedMeta = await (await fetch(`${state.mockUrl}/__qa/state`)).json();
  const meta = { label, ref: state.ref, sha: state.sha, engine, mode: state.prod ? "production build" : "next dev", asOf: seedMeta.meta.as_of, liveTransactions: seedMeta.meta.live_transactions, at: new Date().toISOString() };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "audit.json"), JSON.stringify({ meta, results }, null, 2));
  writeFileSync(resolve(outDir, "audit.md"), summarize(results, meta));
  console.log(`\nWrote ${resolve(outDir, "audit.md")}`);
}

const median = (xs) => {
  const s = xs.filter((x) => typeof x === "number").sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};

async function perf() {
  const state = requireStack();
  if (!state.prod) console.warn("⚠ This stack is `next dev` — numbers will measure the compiler. Use: node cli.mjs up --prod");
  const runs = Number(flags.runs ?? 3);
  const latencyMs = Number(flags.latency ?? 80);
  const seedMeta = (await (await fetch(`${state.mockUrl}/__qa/state`)).json()).meta;
  const label = flags.label ?? `perf-${state.sha.slice(0, 7)}-${seedMeta.scale}x${state.prod ? "" : "-dev"}`;
  const outDir = resolve(QA_ROOT, "artifacts", label);
  const screens = (positional.length ? positional : ["/", "/budget", "/balances", "/recent", "/add", "/transactions", "/spending"]).map((p) => ({ path: p }));
  const storageState = authStatePath(state.port, "andru");
  await fetch(`${state.mockUrl}/__qa/faults`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ latencyMs }) });
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  const results = { meta: { label, ref: state.ref, sha: state.sha, mode: state.prod ? "production build" : "next dev", liveTransactions: seedMeta.live_transactions, scale: seedMeta.scale, device: PERF_DEVICE, cpuThrottle: 2, backendLatencyMs: latencyMs, runs, at: new Date().toISOString() }, cold: {}, tabs: null, taps: [] };
  try {
    for (const network of ["wifi", "cellular"]) {
      results.cold[network] = [];
      for (const s of screens) {
        const samples = [];
        for (let i = 0; i < runs; i++) samples.push(await measureColdLoad(browser, { device: PERF_DEVICE, appUrl: state.appUrl, storageState, network }, s.path));
        const keys = Object.keys(samples[0]).filter((k) => typeof samples[0][k] === "number");
        const med = Object.fromEntries(keys.map((k) => [k, median(samples.map((x) => x[k]))]));
        results.cold[network].push({ path: s.path, ...med });
        console.log(`${network.padEnd(9)} ${s.path.padEnd(14)} FCP ${med.fcp}ms  LCP ${med.lcp}ms  interactive ${med.interactive}ms  TBT ${med.tbt}ms  TTFB ${med.ttfb}ms  DOM ${med.domNodes}`);
      }
    }
    const tabs = SCREENS.filter((s) => s.tab);
    results.tabs = await measureTabSwitches(browser, { device: PERF_DEVICE, appUrl: state.appUrl, storageState }, tabs.map((t) => ({ path: t.path, label: t.tabLabel })));
    for (const t of results.tabs) console.log(`tab → ${t.to.padEnd(10)} url ${t.urlChangeMs}ms, settled ${t.networkIdleMs}ms`);
    const taps = [
      { label: "Open the Add sheet (+)", path: "/", locator: (p) => p.getByRole("button", { name: /add transaction/i }).first() },
      { label: "Open a budget category", path: "/budget", locator: (p) => p.locator("main button").filter({ hasText: " of $" }).first() },
      { label: "Open a recent transaction", path: "/recent", locator: (p) => p.locator("main").getByRole("button").filter({ hasText: "$" }).first() },
    ];
    for (const tap of taps) {
      try {
        const r = await measureTap(browser, { device: PERF_DEVICE, appUrl: state.appUrl, storageState }, tap);
        results.taps.push(r);
        console.log(`tap: ${tap.label.padEnd(28)} input→paint ${r.inputToPaintMs}ms`);
      } catch (e) {
        results.taps.push({ label: tap.label, error: String(e.message).split("\n")[0] });
      }
    }
  } finally {
    await browser.close();
    await fetch(`${state.mockUrl}/__qa/faults`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  }
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "perf.json"), JSON.stringify(results, null, 2));
  const m = results.meta;
  const md = [`# Performance — ${label}`, "", `${m.mode}, ref ${m.ref} (${m.sha.slice(0, 10)}), ${m.liveTransactions} live transactions (${m.scale}x seed). Device: ${m.device}, CPU throttled ${m.cpuThrottle}x, backend latency ${m.backendLatencyMs}ms/request, median of ${m.runs} cold loads (fresh browser profile, warm server). ${m.at}`, ""];
  for (const network of Object.keys(results.cold)) {
    md.push(`## Cold start — ${network}`, "", "| Screen | TTFB | FCP | LCP | Interactive | TBT | Longest task | JS heap MB | DOM nodes | Largest list | KB transferred |", "|---|---|---|---|---|---|---|---|---|---|---|");
    for (const r of results.cold[network]) md.push(`| ${r.path} | ${r.ttfb} | ${r.fcp} | ${r.lcp} | ${r.interactive} | ${r.tbt} | ${r.longestTask} | ${r.jsHeapMb} | ${r.domNodes} | ${r.largestList} | ${r.transferKb} |`);
    md.push("");
  }
  md.push("## Tab switches (tap in the bottom bar, wifi)", "", "| To | URL changed | Settled |", "|---|---|---|", ...results.tabs.map((t) => `| ${t.to} | ${t.urlChangeMs}ms | ${t.networkIdleMs}ms |`), "");
  md.push("## Tap latency (input → next paint)", "", "| Action | ms |", "|---|---|", ...results.taps.map((t) => `| ${t.label} | ${t.error ? `error: ${t.error}` : t.inputToPaintMs} |`), "");
  writeFileSync(resolve(outDir, "perf.md"), md.join("\n"));
  console.log(`\nWrote ${resolve(outDir, "perf.md")}`);
}

async function control(path, body) {
  const state = requireStack();
  const res = await fetch(`${state.mockUrl}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  console.log(JSON.stringify(await res.json(), null, 2));
}

const commands = {
  up: () => up({ ref: flags.ref, port: flags.port ? Number(flags.port) : undefined, seed: flags.seed, prod: flags.prod === "true", lan: flags.lan === "true" }),
  down: () => down(),
  status: () => console.log(JSON.stringify(readState() ?? { running: false }, null, 2)),
  shot,
  audit,
  perf,
  // A full restart, not just a mock reload: the app caches whole tables with
  // no expiry, so reloading the mock alone would leave it serving stale data.
  reset: () => {
    const s = readState();
    if (!s) return console.error("Nothing running — use: node cli.mjs up");
    return up({ ref: s.sha, port: s.port, seed: flags.seed ?? s.seed, prod: s.prod, lan: s.lan });
  },
  fault: () => control("/__qa/faults", positional[0] === "off" || !positional[0] ? {} : JSON.parse(positional[0])),
};

if (!commands[command]) {
  console.log("Usage: node cli.mjs <up|down|status|shot|audit|reset|fault> [options] — see the header of cli.mjs or qa/README.md");
  process.exit(command ? 1 : 0);
}
await commands[command]();
