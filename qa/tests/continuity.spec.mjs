// State and continuity: back closes the top layer instead of leaving the
// page, and scroll position survives opening a transaction and closing it.
// "Back" here is history.back(): what the Android back button, a browser back
// swipe, and any in-app back arrow that uses the router all trigger.
//
// Row and tab locators are deliberately loose (role + visible text) so the
// rebuild's markup changes don't break them; update here if labels change.

import { expect, test } from "./helpers.mjs";

test.beforeEach(async ({}, testInfo) => {
  testInfo.skip(testInfo.project.name !== "small", "behavior, not layout — one device is enough");
});

const back = (page) => page.evaluate(() => history.back()).then(() => page.waitForTimeout(800));
const openDialog = (page) => page.locator('[role="dialog"][aria-modal="true"], [data-sheet-open]').filter({ visible: true });
const transactionRows = (page) => page.getByRole("button").filter({ hasText: /\$\s?[\d,]+\.\d\d/ }).filter({ visible: true });

test("back closes the add sheet and stays on the page it was opened from", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Budget", exact: true }).first().click();
  await expect(page).toHaveURL(/\/budget$/);
  await page.getByRole("button", { name: /add transaction/i }).first().click();
  const amount = page.locator('input[inputmode="decimal"]').first();
  await expect(amount).toBeVisible();

  await back(page);

  expect(new URL(page.url()).pathname, "back left the page instead of closing the sheet").toBe("/budget");
  await expect(amount).toBeHidden();
});

test("back closes a transaction's details and stays on the list", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Recent", exact: true }).first().click();
  await expect(page).toHaveURL(/\/recent$/);
  await transactionRows(page).nth(3).click();
  await expect(openDialog(page)).toHaveCount(1);

  await back(page);

  expect(new URL(page.url()).pathname, "back left the list instead of closing the details").toBe("/recent");
  await expect(openDialog(page)).toHaveCount(0);
});

test("scroll position is the same after opening a transaction and closing it", async ({ page }) => {
  await page.goto("/recent");
  const rows = transactionRows(page);
  await expect(rows.nth(40)).toBeAttached();
  await rows.nth(40).scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);

  const scrollState = () =>
    page.evaluate(() => {
      const scrollers = [document.scrollingElement, ...document.querySelectorAll("*")].filter((el) => el && el.scrollHeight > el.clientHeight + 20 && el.scrollTop > 0);
      return scrollers.map((el) => Math.round(el.scrollTop));
    });
  const before = await scrollState();
  expect(before.length, "couldn't scroll the list").toBeGreaterThan(0);

  await rows.nth(40).click();
  await expect(openDialog(page)).toHaveCount(1);
  await openDialog(page).getByRole("button", { name: /^(close|done|back)$/i }).first().click();
  await expect(openDialog(page)).toHaveCount(0);
  await page.waitForTimeout(500);

  const after = await scrollState();
  expect(after.length, `scroll reset to the top (was ${before[0]}px)`).toBeGreaterThan(0);
  expect(Math.abs(after[0] - before[0]), `scrolled from ${before[0]}px to ${after[0]}px`).toBeLessThanOrEqual(12);
});
