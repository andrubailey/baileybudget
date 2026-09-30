// No signal: opening the app, logging with no connection, and syncing once
// the connection returns. (Lost replies and retries are in trust.spec.mjs.)

import { expect, liveRowsWithDescription, test, unique } from "./helpers.mjs";

test.beforeEach(async ({}, testInfo) => {
  testInfo.skip(testInfo.project.name !== "small", "behavior, not layout");
});

test("the installed app still opens with no signal", async ({ page, context }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500); // room for a service worker to install and cache
  await context.setOffline(true);
  const failed = await page.reload().then(() => false, () => true);
  const text = failed ? "" : await page.evaluate(() => document.body.innerText);
  await context.setOffline(false);
  expect(failed || /ERR_INTERNET_DISCONNECTED|No internet|not available/i.test(text), "reopening with no signal shows the browser's offline error instead of the app").toBe(false);
});

test("a transaction logged with no signal is kept, shown as waiting, and sent exactly once on return", async ({ page, context }) => {
  const description = unique("offline");
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await context.setOffline(true);
  await page.getByRole("button", { name: /add transaction/i }).first().click();

  await page.locator('input[inputmode="decimal"]').first().fill("8.25");
  await page.getByPlaceholder("Whole Foods").fill(description);
  await page.getByRole("button", { name: /^Add expense/ }).click();
  await page.waitForTimeout(1500);
  expect(await liveRowsWithDescription(description), "nothing should reach the server while offline").toHaveLength(0);

  const visibleWhileOffline = await page.evaluate(() => document.body.innerText);
  expect.soft(visibleWhileOffline.trim().length, "the screen went blank after tapping Add with no signal").toBeGreaterThan(0);
  expect.soft(visibleWhileOffline, "no on-screen sign the transaction is waiting to send").toMatch(/queued|waiting|will send|not sent|pending|offline|no connection/i);

  await context.setOffline(false);
  let synced = false;
  try {
    await expect.poll(async () => (await liveRowsWithDescription(description)).length, { timeout: 20_000 }).toBeGreaterThan(0);
    synced = true;
  } catch {
    expect.soft(synced, "didn't sync by itself when the connection returned (20s)").toBe(true);
    await page.goto("/"); // reopening the app
    await expect
      .poll(async () => (await liveRowsWithDescription(description)).length, { timeout: 20_000, message: "LOST: never synced, even after reopening the app" })
      .toBeGreaterThan(0);
  }
  await page.waitForTimeout(3000);
  expect(await liveRowsWithDescription(description), "synced more than once").toHaveLength(1);
});
