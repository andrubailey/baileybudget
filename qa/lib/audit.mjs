// Automated, behavior-level checks for one screen at one device. Everything
// here is measured in the page, not eyeballed from a screenshot.

import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { DEVICES, applySafeArea, contextOptions } from "../devices.mjs";

// Next's dev-mode indicator (the floating "N") only exists under `next dev`,
// but it sits on top of the tab bar and would pollute every hit-test.
export const HIDE_DEV_OVERLAY = () => {
  const style = document.createElement("style");
  style.textContent = "nextjs-portal, [data-nextjs-dev-tools-button], [data-next-badge-root] { display: none !important; }";
  const add = () => document.head && document.head.appendChild(style);
  if (document.head) add();
  else document.addEventListener("DOMContentLoaded", add);
};

// Installed before any page script runs, so layout shifts and LCP during
// load are captured (Chromium only; WebKit leaves these empty).
const PERF_INIT = () => {
  window.__qaPerf = { cls: 0, shifts: [], lcp: null, longTasks: [] };
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.hadRecentInput) continue;
        window.__qaPerf.cls += e.value;
        window.__qaPerf.shifts.push({
          value: Math.round(e.value * 1000) / 1000,
          t: Math.round(e.startTime),
          nodes: (e.sources ?? []).map((s) => (s.node && s.node.nodeType === 1 ? `${s.node.tagName.toLowerCase()}.${String(s.node.className).split(" ").slice(0, 3).join(".")}` : "?")).slice(0, 3),
        });
      }
    }).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver((list) => {
      const last = list.getEntries().at(-1);
      if (last) window.__qaPerf.lcp = Math.round(last.startTime);
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__qaPerf.longTasks.push({ t: Math.round(e.startTime), ms: Math.round(e.duration) });
    }).observe({ type: "longtask", buffered: true });
  } catch {
    // Unsupported engine — fields stay empty.
  }
};

// Runs inside the page. Must be self-contained (no closures over Node code).
async function inPageAudit({ safeArea, deviceWidth, deviceHeight }) {
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  // Measure against the phone's real CSS width, never innerWidth: when a
  // page overflows, mobile Chromium silently widens the layout viewport to
  // fit it (innerWidth grows), which hides the very overflow being checked.
  const vw = deviceWidth;
  const vh = deviceHeight;
  const INTERACTIVE = 'a[href], button, [role="button"], input:not([type="hidden"]), select, textarea, summary, [tabindex]:not([tabindex="-1"])';

  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    if (el.closest('[aria-hidden="true"], [hidden], [inert]')) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05;
  };
  const isFixedish = (el) => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const p = getComputedStyle(n).position;
      if (p === "fixed" || p === "sticky") return n;
    }
    return null;
  };
  const describe = (el) => {
    const name = (el.getAttribute("aria-label") || el.innerText || el.getAttribute("title") || el.getAttribute("placeholder") || el.value || "").trim().replace(/\s+/g, " ").slice(0, 60);
    const tag = el.tagName.toLowerCase();
    const cls = String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className).split(" ").filter(Boolean).slice(0, 4).join(".");
    return `${tag}${cls ? `.${cls}` : ""}${name ? ` "${name}"` : ""}`;
  };

  const out = { viewport: { width: vw, height: vh }, layoutViewportWidth: window.innerWidth, safeArea };

  // 1. Horizontal overflow — the page should never scroll sideways — plus
  //    whether it LOADED already panned sideways (something called
  //    scrollIntoView and dragged the whole page along).
  out.overflowX = Math.max(0, Math.max(document.documentElement.scrollWidth, window.innerWidth) - vw);
  out.loadedPannedX = Math.round(window.scrollX + (window.visualViewport ? window.visualViewport.offsetLeft : 0));
  if (out.overflowX > 1) {
    const docX = window.scrollX + (window.visualViewport ? window.visualViewport.offsetLeft : 0);
    out.overflowCulprits = [...document.querySelectorAll("body *")]
      .filter((el) => visible(el) && !isFixedish(el) && el.getBoundingClientRect().right + docX > vw + 1)
      .filter((el) => {
        for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
          const ox = getComputedStyle(n).overflowX;
          if (ox === "auto" || ox === "scroll" || ox === "hidden" || ox === "clip") return false;
        }
        return true;
      })
      .filter((el, _i, arr) => !arr.some((other) => other !== el && el.contains(other)))
      .slice(0, 5)
      .map((el) => ({ el: describe(el), right: Math.round(el.getBoundingClientRect().right + docX), parent: describe(el.parentElement) }));
  }

  // 2. Fixed bottom chrome (the tab bar / floating nav): its top edge is the
  //    real floor content has to clear.
  const fixedBottom = [...document.querySelectorAll("body *")].filter((el) => {
    const cs = getComputedStyle(el);
    if (cs.position !== "fixed" || !visible(el)) return false;
    const r = el.getBoundingClientRect();
    return r.bottom >= vh - 2 && r.height < vh * 0.4 && r.width > vw * 0.5;
  });
  // Floating buttons (chat bubble, add) that sit above the nav: they don't
  // span the width, but they cover content on their side of the screen.
  const floating = [...document.querySelectorAll("body *")].filter((el) => {
    if (getComputedStyle(el).position !== "fixed" || !visible(el) || fixedBottom.some((f) => f.contains(el) || el.contains(f))) return false;
    const r = el.getBoundingClientRect();
    return r.top > vh * 0.55 && r.width <= vw * 0.5 && r.height < vh * 0.3 && el.querySelector("button, a, svg");
  });
  out.floatingButtons = floating.slice(0, 4).map((el) => {
    const r = el.getBoundingClientRect();
    return { el: describe(el), top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width) };
  });
  // The nav's visible surface can be a child of a transparent, full-width
  // fixed wrapper — use the topmost visible interactive element inside it.
  let navTop = vh;
  for (const el of fixedBottom) {
    const inner = [...el.querySelectorAll(INTERACTIVE)].filter(visible);
    const top = inner.length ? Math.min(...inner.map((i) => i.getBoundingClientRect().top)) : el.getBoundingClientRect().top;
    navTop = Math.min(navTop, top);
  }
  out.fixedBottomNav = fixedBottom.length ? { top: Math.round(navTop), elements: fixedBottom.slice(0, 3).map(describe) } : null;
  const homeIndicatorTop = vh - (safeArea?.bottom ?? 0);
  const floor = Math.min(navTop, homeIndicatorTop);

  // 3. Scroll to the absolute bottom, then: does the last content clear the
  //    nav and the home indicator, and is every tappable thing actually
  //    tappable (hit-tested, not just geometry)?
  window.scrollTo(0, document.scrollingElement.scrollHeight);
  await frame();
  await new Promise((r) => setTimeout(r, 250));
  // Collapsed <details> content reports a real rect in some engines; it
  // isn't on screen, so it can't be "the last element".
  const collapsed = (el) => {
    const d = el.closest("details:not([open])");
    return d && !el.closest("summary");
  };
  const content = [...document.querySelectorAll("main *, [role=main] *")].filter((el) => visible(el) && !isFixedish(el) && !collapsed(el) && el.children.length === 0);
  const lowest = content.reduce((best, el) => (!best || el.getBoundingClientRect().bottom > best.getBoundingClientRect().bottom ? el : best), null);
  if (lowest) {
    const b = lowest.getBoundingClientRect().bottom;
    out.bottomClearance = { lastElement: describe(lowest), bottom: Math.round(b), floor: Math.round(floor), clearancePx: Math.round(floor - b) };
  }
  const interactive = [...document.querySelectorAll(INTERACTIVE)].filter((el) => visible(el) && !isFixedish(el));
  out.occluded = [];
  // Only the bottom chrome matters here: at the end of the scroll, rows
  // sliding under the sticky TOP header is normal — rows the user can't
  // scroll out from under the nav, FAB or home indicator are the defect.
  const bottomChrome = (hit) => {
    const f = hit && isFixedish(hit);
    return f && f.getBoundingClientRect().top > vh * 0.4 ? f : null;
  };
  for (const el of interactive) {
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > vh || r.top < vh * 0.5) continue;
    const cy = r.top + r.height / 2;
    // Sample left, middle and right thirds: a floating button over the
    // right edge of a row hides its amount even when the center is clear.
    const samples = [0.2, 0.5, 0.8].map((f) => Math.min(Math.max(r.left + r.width * f, 1), vw - 1));
    const coveredBy = new Set();
    let coveredCount = 0;
    for (const x of samples) {
      const hit = cy >= 0 && cy <= vh ? document.elementFromPoint(x, cy) : null;
      const chrome = hit && hit !== el && !el.contains(hit) ? bottomChrome(hit) : null;
      if (chrome) {
        coveredCount++;
        coveredBy.add(describe(chrome));
      }
    }
    const underIndicator = cy > homeIndicatorTop;
    if (underIndicator || coveredCount) {
      out.occluded.push({
        el: describe(el),
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        coverage: coveredCount === 3 ? "fully" : "partly",
        reason: coveredCount ? `${coveredCount === 3 ? "fully" : "partly"} covered by ${[...coveredBy].join(" + ")}` : "center sits in the home-indicator zone",
      });
    }
  }

  // Text clipped vertically with no ellipsis — a banner or card cutting a
  // sentence off mid-line (single-line ellipsis truncation is intentional
  // and isn't flagged).
  out.clippedText = [...document.querySelectorAll("body *")]
    .filter((el) => {
      if (!visible(el) || !(el.innerText || "").trim()) return false;
      const cs = getComputedStyle(el);
      if (!["hidden", "clip"].includes(cs.overflowY) || cs.textOverflow === "ellipsis" || cs.webkitLineClamp !== "none") return false;
      return el.scrollHeight > el.clientHeight + 4 && el.clientHeight > 0;
    })
    .filter((el, _i, arr) => !arr.some((other) => other !== el && el.contains(other)))
    .slice(0, 5)
    .map((el) => ({ el: describe(el), visibleHeight: el.clientHeight, contentHeight: el.scrollHeight }));

  // 4. Tap targets under 44x44 CSS px (Apple HIG), whole page.
  const all = [...document.querySelectorAll(INTERACTIVE)].filter(visible);
  const small = all
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ el, r }) => (r.width < 44 || r.height < 44) && !(el.tagName === "A" && el.closest("p")))
    .map(({ el, r }) => ({ el: describe(el), w: Math.round(r.width), h: Math.round(r.height) }));
  const seen = new Set();
  out.smallTargets = small.filter((s) => (seen.has(s.el) ? false : seen.add(s.el)));
  out.interactiveCount = all.length;

  // 5. Inputs iOS will zoom into on focus (font-size under 16px).
  out.zoomOnFocusInputs = [...document.querySelectorAll("input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea, select")]
    .filter(visible)
    .map((el) => ({ el: describe(el), fontSize: parseFloat(getComputedStyle(el).fontSize) }))
    .filter((x) => x.fontSize < 16);

  // 6. Top inset: at scroll 0, does anything readable sit under the status
  //    bar / notch?
  window.scrollTo(0, 0);
  await frame();
  const topInset = safeArea?.top ?? 0;
  out.underStatusBar = topInset
    ? [...document.querySelectorAll("body *")]
        .filter((el) => visible(el) && el.children.length === 0 && (el.innerText || "").trim() && el.getBoundingClientRect().top < topInset - 1 && el.getBoundingClientRect().bottom > 0)
        .slice(0, 5)
        .map((el) => ({ el: describe(el), top: Math.round(el.getBoundingClientRect().top) }))
    : [];

  // 7. Longest list on the page, to spot "renders everything" lists.
  const lists = [...document.querySelectorAll("ul, ol, tbody, [role=list]")].map((l) => l.children.length);
  out.largestListItems = lists.length ? Math.max(...lists) : 0;
  out.domNodes = document.getElementsByTagName("*").length;
  out.pageHeight = document.scrollingElement.scrollHeight;
  out.perf = window.__qaPerf ?? null;
  return out;
}

export async function auditScreen({ browser, engine, device, appUrl, storageState, screen, outDir }) {
  const context = await browser.newContext({ ...contextOptions(device), baseURL: appUrl, storageState: screen.auth === false ? undefined : storageState });
  await context.addInitScript(PERF_INIT);
  await context.addInitScript(HIDE_DEV_OVERLAY);
  const page = await context.newPage();
  const safeAreaApplied = engine === "chromium" ? await applySafeArea(page, device) : false;
  const consoleErrors = [];
  const failedRequests = [];
  const mockNoise = [];
  // Presence ("who's online") uses Supabase Realtime, which the QA mock
  // doesn't implement — kept out of the error counts so they reflect the app.
  const isMockNoise = (s) => /realtime\/v1\/websocket/.test(s);
  const clean = (s) => s.replace(/apikey=[^&\s'"]+/g, "apikey=…").slice(0, 300);
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    (isMockNoise(m.text()) ? mockNoise : consoleErrors).push(clean(m.text()));
  });
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${clean(String(e.message))}`));
  // ERR_ABORTED is the client cancelling (link prefetches in flight when the
  // audit closes the page, superseded RSC fetches) — not a failure the user sees.
  page.on("requestfailed", (r) => {
    if (/ERR_ABORTED|NS_BINDING_ABORTED|cancelled/i.test(r.failure()?.errorText ?? "")) return;
    (isMockNoise(r.url()) ? mockNoise : failedRequests).push(`${r.method()} ${clean(r.url()).slice(0, 120)} — ${r.failure()?.errorText}`);
  });
  page.on("response", (r) => r.status() >= 500 && failedRequests.push(`${r.status()} ${clean(r.url()).slice(0, 120)}`));

  const started = Date.now();
  let status = null;
  let navError = null;
  try {
    const res = await page.goto(screen.path, { waitUntil: "load", timeout: 180000 });
    status = res?.status() ?? null;
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  } catch (e) {
    navError = String(e.message).split("\n")[0];
  }
  const loadMs = Date.now() - started;
  const finalPath = new URL(page.url()).pathname;

  let result = { error: navError };
  if (!navError) {
    const timing = await page.evaluate(() => {
      const n = performance.getEntriesByType("navigation")[0];
      return n ? { ttfb: Math.round(n.responseStart), domContentLoaded: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd) } : null;
    });
    const measured = await page.evaluate(inPageAudit, {
      safeArea: safeAreaApplied ? DEVICES[device].safeArea : { top: 0, right: 0, bottom: 0, left: 0 },
      deviceWidth: DEVICES[device].viewport.width,
      deviceHeight: DEVICES[device].viewport.height,
    });
    mkdirSync(outDir, { recursive: true });
    const base = resolve(outDir, screen.slug);
    await page.screenshot({ path: `${base}-top.png` });
    await page.evaluate(() => window.scrollTo(0, document.scrollingElement.scrollHeight));
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${base}-bottom.png` });
    result = { ...measured, timing };
  }
  await context.close();
  return { screen: screen.path, label: screen.label, device, engine, status, finalPath, redirected: finalPath !== screen.path, loadMs, safeAreaApplied, consoleErrors, failedRequests, mockNoise: mockNoise.length, ...result };
}
