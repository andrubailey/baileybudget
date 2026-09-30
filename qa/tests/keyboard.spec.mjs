// The on-screen keyboard, modeled the way iOS behaves: it covers the bottom
// of the screen without resizing the page (window.innerHeight and 100dvh stay
// the same), and only window.visualViewport reports the smaller visible area.
//
// Emulators can't open a real keyboard, so each input is focused, a keyboard
// of the device's modeled height (devices.mjs → keyboard) is drawn over the
// bottom of the page, and a stand-in visualViewport reports the shrunk height
// and fires `resize` — exactly what an app that handles the keyboard properly
// listens to. Then: is the focused field fully visible, and can the submit
// button be seen without dismissing the keyboard?
//
// Passing here is necessary, not sufficient — confirm on a phone with
// `node cli.mjs up --lan`. Failing here is a real defect.

import { DEVICES } from "../devices.mjs";
import { expect, test } from "./helpers.mjs";

const FAKE_VISUAL_VIEWPORT = `(() => {
  const target = new EventTarget();
  let keyboard = 0;
  const vv = {
    get width() { return window.innerWidth; },
    get height() { return window.innerHeight - keyboard; },
    offsetTop: 0,
    offsetLeft: 0,
    get pageTop() { return window.scrollY; },
    get pageLeft() { return window.scrollX; },
    scale: 1,
    onresize: null,
    onscroll: null,
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    dispatchEvent: target.dispatchEvent.bind(target),
  };
  Object.defineProperty(window, "visualViewport", { get: () => vv, configurable: true });
  window.__qaKeyboard = (h) => {
    keyboard = h;
    let kb = document.getElementById("__qa-keyboard");
    if (!kb) {
      kb = document.createElement("div");
      kb.id = "__qa-keyboard";
      kb.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:2147483647;pointer-events:none;background:rgba(40,40,48,.82);color:#fff;font:600 12px system-ui;display:flex;align-items:center;justify-content:center";
      kb.textContent = "modeled keyboard";
      document.documentElement.appendChild(kb);
    }
    kb.style.height = h + "px";
    kb.style.display = h ? "flex" : "none";
    const e = new Event("resize");
    target.dispatchEvent(e);
    vv.onresize?.(e);
  };
})();`;

const ENTRY_TYPES = ["Expense", "Transfer", "Income"];
const TEXT_INPUTS = 'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]), textarea';

test.describe("keyboard", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(FAKE_VISUAL_VIEWPORT);
  });

  for (const type of ENTRY_TYPES) {
    test(`add sheet (${type}): every field and the submit button stay visible above the keyboard`, async ({ page }, testInfo) => {
      const kb = DEVICES[testInfo.project.name].keyboard;
      await page.goto("/add");
      const tab = page.getByRole("button", { name: type, exact: true }).or(page.getByRole("tab", { name: type, exact: true })).first();
      await tab.click();
      const submit = page.getByRole("button", { name: new RegExp(`^(Add|Save|Log) ${type}`, "i") }).first();
      await expect(submit).toBeAttached();

      const inputs = page.locator(TEXT_INPUTS).filter({ visible: true });
      const count = await inputs.count();
      expect(count, "no text inputs found in the sheet").toBeGreaterThan(0);

      const problems = [];
      for (let i = 0; i < count; i++) {
        const input = inputs.nth(i);
        const mode = (await input.getAttribute("inputmode")) ?? (await input.getAttribute("type")) ?? "text";
        const height = /decimal|numeric|number|tel/.test(mode) ? kb.decimal : kb.text;
        const name = (await input.getAttribute("placeholder")) || (await input.getAttribute("aria-label")) || (await input.getAttribute("name")) || `input #${i + 1}`;

        await input.focus();
        await page.evaluate((h) => window.__qaKeyboard(h), height);
        await page.waitForTimeout(400);

        const m = await page.evaluate(
          ([sel, idx, submitName]) => {
            const visibleBottom = window.visualViewport.height + window.visualViewport.offsetTop;
            const el = [...document.querySelectorAll(sel)].filter((e) => e.getClientRects().length)[idx];
            const r = el.getBoundingClientRect();
            const btn = [...document.querySelectorAll("button")].find((b) => new RegExp(submitName, "i").test(b.textContent.trim()) && b.getClientRects().length);
            btn?.scrollIntoView({ block: "nearest" });
            const b = btn?.getBoundingClientRect();
            return {
              visibleBottom: Math.round(visibleBottom),
              field: { top: Math.round(r.top), bottom: Math.round(r.bottom) },
              submit: b ? { top: Math.round(b.top), bottom: Math.round(b.bottom) } : null,
            };
          },
          [TEXT_INPUTS, i, `^(Add|Save|Log) ${type}`],
        );

        if (m.field.bottom > m.visibleBottom || m.field.top < 0)
          problems.push(`"${name}" (${mode} keypad, ${height}px): field at ${m.field.top}–${m.field.bottom}px, visible area ends at ${m.visibleBottom}px`);
        if (!m.submit || m.submit.bottom > m.visibleBottom || m.submit.top < 0)
          problems.push(`"${name}" (${mode} keypad, ${height}px): submit button at ${m.submit ? `${m.submit.top}–${m.submit.bottom}px` : "missing"}, hidden behind the keyboard`);

        if (problems.length && !testInfo.attachments.some((a) => a.name === "keyboard-up.png")) {
          const path = testInfo.outputPath("keyboard-up.png");
          await page.screenshot({ path });
          await testInfo.attach("keyboard-up.png", { path, contentType: "image/png" });
        }

        await page.evaluate(() => window.__qaKeyboard(0));
        await input.blur();
      }
      expect(problems).toEqual([]);
    });
  }
});
