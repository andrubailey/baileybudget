// Every screen at every device in the matrix: the same in-page measurements
// as `node cli.mjs audit`, as pass/fail assertions. Screens come from
// screens.mjs — add a route there and it's covered here automatically.

import { auditScreen } from "../lib/audit.mjs";
import { SCREENS, slug } from "../screens.mjs";
import { authState, expect, stack, test } from "./helpers.mjs";

const TAP_MIN = 44;
const CLEARANCE_MIN = 8;

for (const s of SCREENS) {
  test.describe(`${s.label} (${s.path})`, () => {
    let r;

    test.beforeAll(async ({ browser }, testInfo) => {
      r = await auditScreen({
        browser,
        engine: "chromium",
        device: testInfo.project.name,
        appUrl: stack.appUrl,
        storageState: authState(),
        screen: { ...s, slug: slug(s.path) },
        outDir: testInfo.outputPath("screens"),
      });
    });

    test("loads without errors (console, page errors, 5xx)", () => {
      expect(r.error, "navigation").toBeFalsy();
      expect([...r.consoleErrors, ...r.failedRequests]).toEqual([]);
    });

    test("never scrolls sideways, and doesn't load panned", () => {
      expect(r.overflowX, `wider than the phone: ${JSON.stringify(r.overflowCulprits ?? [])}`).toBeLessThanOrEqual(1);
      expect(r.loadedPannedX, "loaded already scrolled sideways").toBe(0);
    });

    test("the last thing on the page clears the nav and home indicator", () => {
      test.skip(!r.bottomClearance, "no content measured");
      expect(r.bottomClearance.clearancePx, `${r.bottomClearance.lastElement} vs floor ${r.bottomClearance.floor}px`).toBeGreaterThanOrEqual(CLEARANCE_MIN);
    });

    test("nothing tappable is stuck under the bottom chrome", () => {
      expect(r.occluded.map((o) => `${o.el}: ${o.reason}`)).toEqual([]);
    });

    test("no text is cut off mid-sentence", () => {
      expect(r.clippedText.map((c) => `${c.el} (${c.visibleHeight}/${c.contentHeight}px)`)).toEqual([]);
    });

    test("no input makes iOS zoom the page on focus (<16px)", () => {
      expect(r.zoomOnFocusInputs.map((z) => `${z.el} ${z.fontSize}px`)).toEqual([]);
    });

    test(`every tap target is at least ${TAP_MIN}px`, () => {
      expect(r.smallTargets.map((t) => `${t.el} ${t.w}×${t.h}`)).toEqual([]);
    });

    test("nothing readable sits under the status bar", () => {
      expect(r.underStatusBar.map((u) => `${u.el} @${u.top}px`)).toEqual([]);
    });
  });
}
