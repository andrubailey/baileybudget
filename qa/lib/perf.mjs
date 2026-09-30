// Performance measurement for the mobile screens, meant to run against a
// production build (`node cli.mjs up --prod`) — dev-mode timings measure
// the compiler, not the app.
//
// Conditions are explicit and reported with every number:
//  - CPU: throttled 2x (Chromium), a rough stand-in for a recent iPhone
//    relative to this Mac. Absolute numbers are indicative; compare runs.
//  - Network: "wifi" (no throttle) or "cellular" (150ms RTT, 1.6 Mbps down,
//    750 Kbps up — Lighthouse's Slow 4G).
//  - Backend: the QA mock with an added per-request latency (default 80ms,
//    roughly a Vercel-to-Supabase round trip), since a localhost database
//    would flatter every server-side number.
//  - "Cold start" = fresh browser profile (no HTTP cache, no service
//    worker); the server is warm, as it usually is in production.

import { DEVICES, applySafeArea, contextOptions } from "../devices.mjs";
import { HIDE_DEV_OVERLAY } from "./audit.mjs";

const PERF_INIT = () => {
  window.__qa = { lcp: null, longTasks: [], events: [] };
  try {
    new PerformanceObserver((l) => {
      const e = l.getEntries().at(-1);
      if (e) window.__qa.lcp = e.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__qa.longTasks.push({ start: e.startTime, duration: e.duration });
    }).observe({ type: "longtask", buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__qa.events.push({ name: e.name, duration: e.duration, start: e.startTime });
    }).observe({ type: "event", buffered: true, durationThreshold: 16 });
  } catch {
    // unsupported
  }
};

const NETWORK = {
  wifi: null,
  cellular: { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 },
};

export async function newPerfPage(browser, { device, appUrl, storageState, network = "wifi", cpu = 2 }) {
  const context = await browser.newContext({ ...contextOptions(device), baseURL: appUrl, storageState });
  await context.addInitScript(PERF_INIT);
  await context.addInitScript(HIDE_DEV_OVERLAY);
  const page = await context.newPage();
  await applySafeArea(page, device);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");
  if (cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
  if (NETWORK[network]) {
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", NETWORK[network]);
  }
  return { context, page, cdp };
}

// Waits until no long task has run for `quietMs` (a practical "interactive").
async function settle(page, quietMs = 1500, maxMs = 15000) {
  const started = Date.now();
  let lastCount = -1;
  let stableSince = Date.now();
  while (Date.now() - started < maxMs) {
    const count = await page.evaluate(() => window.__qa?.longTasks.length ?? 0);
    if (count !== lastCount) {
      lastCount = count;
      stableSince = Date.now();
    } else if (Date.now() - stableSince >= quietMs) break;
    await page.waitForTimeout(200);
  }
}

export async function measureColdLoad(browser, opts, path) {
  const { context, page, cdp } = await newPerfPage(browser, opts);
  try {
    const res = await page.goto(path, { waitUntil: "load", timeout: 120000 });
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    await settle(page);
    const m = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0];
      const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? null;
      const lts = window.__qa.longTasks;
      const lastLongTaskEnd = lts.length ? Math.max(...lts.map((t) => t.start + t.duration)) : 0;
      const tbt = lts.filter((t) => fcp === null || t.start >= fcp).reduce((s, t) => s + Math.max(0, t.duration - 50), 0);
      const lists = [...document.querySelectorAll("ul, ol, tbody, [role=list]")].map((l) => l.children.length);
      return {
        ttfb: nav?.responseStart ?? null,
        fcp,
        lcp: window.__qa.lcp,
        domContentLoaded: nav?.domContentLoadedEventEnd ?? null,
        load: nav?.loadEventEnd ?? null,
        interactive: Math.max(fcp ?? 0, lastLongTaskEnd, nav?.domContentLoadedEventEnd ?? 0),
        tbt,
        longestTask: lts.length ? Math.max(...lts.map((t) => t.duration)) : 0,
        transferKb: performance.getEntriesByType("resource").reduce((s, r) => s + (r.transferSize || 0), (nav?.transferSize ?? 0)) / 1024,
        domNodes: document.getElementsByTagName("*").length,
        largestList: lists.length ? Math.max(...lists) : 0,
      };
    });
    const metrics = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((x) => [x.name, x.value]));
    return { path, status: res?.status() ?? null, ...roundAll(m), jsHeapMb: round1(metrics.JSHeapUsedSize / 1048576), scriptMs: Math.round(metrics.ScriptDuration * 1000), layoutMs: Math.round(metrics.LayoutDuration * 1000) };
  } finally {
    await context.close();
  }
}

// Tap a mobile tab and time until the new screen's content is painted.
export async function measureTabSwitches(browser, opts, tabs) {
  const { context, page } = await newPerfPage(browser, opts);
  const results = [];
  try {
    await page.goto(tabs[0].path, { waitUntil: "load" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await settle(page);
    for (const tab of tabs.slice(1)) {
      const link = page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: tab.label, exact: true });
      await link.waitFor({ timeout: 10000 });
      const t0 = Date.now();
      await link.click();
      await page.waitForURL((u) => u.pathname === tab.path, { timeout: 30000 });
      const urlMs = Date.now() - t0;
      await page.waitForLoadState("networkidle").catch(() => {});
      const contentMs = Date.now() - t0;
      await settle(page, 800, 8000);
      results.push({ to: tab.path, urlChangeMs: urlMs, networkIdleMs: contentMs });
    }
  } finally {
    await context.close();
  }
  return results;
}

// Interaction latency: the slowest input → next-paint for a real tap, from
// the Event Timing API (what INP is built on).
export async function measureTap(browser, opts, { path, locator, label }) {
  const { context, page } = await newPerfPage(browser, opts);
  try {
    await page.goto(path, { waitUntil: "load" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await settle(page);
    await page.evaluate(() => (window.__qa.events = []));
    const target = locator(page);
    await target.waitFor({ timeout: 10000 });
    await target.tap();
    await page.waitForTimeout(1500);
    const events = await page.evaluate(() => window.__qa.events);
    const worst = events.reduce((m, e) => Math.max(m, e.duration), 0);
    return { label, path, inputToPaintMs: Math.round(worst), events: events.length };
  } finally {
    await context.close();
  }
}

const round1 = (n) => Math.round(n * 10) / 10;
function roundAll(o) {
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "number" ? Math.round(v) : v]));
}

export const PERF_DEVICE = "small";
export { DEVICES };
