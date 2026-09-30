// With "Reduce Motion" on, primary interactions don't animate movement, and
// still work.

import { expect, test } from "./helpers.mjs";

test.beforeEach(async ({ page }, testInfo) => {
  testInfo.skip(testInfo.project.name !== "small", "behavior, not layout");
  await page.emulateMedia({ reducedMotion: "reduce" });
});

const runningAnimations = (page) =>
  page.evaluate(() =>
    document
      .getAnimations()
      .map((a) => ({ name: a.animationName ?? a.transitionProperty ?? "animation", ms: Number(a.effect?.getTiming().duration) || 0, el: a.effect?.target?.className?.toString().slice(0, 60) ?? "" }))
      .filter((a) => a.ms > 50),
  );

for (const { label, path, action } of [
  { label: "opening the Add sheet", path: "/", action: (page) => page.getByRole("button", { name: /add transaction/i }).first().click() },
  { label: "switching tabs", path: "/", action: (page) => page.getByRole("link", { name: "Budget", exact: true }).first().click() },
  { label: "opening a transaction", path: "/recent", action: (page) => page.getByRole("button").filter({ hasText: /\$\s?[\d,]+\.\d\d/ }).filter({ visible: true }).nth(2).click() },
]) {
  test(`reduced motion: ${label} doesn't animate`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await action(page);
    await page.waitForTimeout(30);
    expect(await runningAnimations(page)).toEqual([]);
  });
}
