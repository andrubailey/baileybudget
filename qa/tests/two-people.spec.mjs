// Two people, two phones: Geralyn logs a transaction while Andru has the app
// open. Measures how long until Andru's screen reflects it (the row itself,
// or a "new activity" prompt he has to tap), and checks the row is
// attributed to her.

import { authState, expect, stack, test, unique } from "./helpers.mjs";
import { applySafeArea, contextOptions } from "../devices.mjs";

const WAIT_MS = 75_000;

test.beforeEach(async ({}, testInfo) => {
  testInfo.skip(testInfo.project.name !== "small", "behavior, not layout");
});

test("a transaction Geralyn adds shows up on Andru's open app, attributed to her", async ({ browser }, testInfo) => {
  test.setTimeout(WAIT_MS + 60_000);
  const open = async (user) => {
    const context = await browser.newContext({ ...contextOptions("small"), baseURL: stack.appUrl, storageState: authState(user) });
    const page = await context.newPage();
    await applySafeArea(page, "small");
    return { context, page };
  };
  const andru = await open("andru");
  const geralyn = await open("geralyn");
  const description = unique("Geralyn phone");

  await andru.page.goto("/recent");
  await andru.page.waitForLoadState("networkidle");

  await geralyn.page.goto("/add");
  await geralyn.page.locator('input[inputmode="decimal"]').first().fill("14.37");
  await geralyn.page.getByPlaceholder("Whole Foods").fill(description);
  await geralyn.page.getByRole("button", { name: /^Add expense/ }).click();
  await geralyn.page.waitForTimeout(1500);
  const savedAt = Date.now();

  const row = andru.page.getByRole("button").filter({ hasText: description });
  const prompt = andru.page.getByText(/new activity|new transactions?/i).filter({ visible: true });
  let promptAfter = null;
  let rowAfter = null;
  while (Date.now() - savedAt < WAIT_MS && rowAfter === null) {
    if (promptAfter === null && (await prompt.count())) promptAfter = Date.now() - savedAt;
    if (await row.count()) rowAfter = Date.now() - savedAt;
    await andru.page.waitForTimeout(1000);
  }
  testInfo.annotations.push({ type: "measured", description: `prompt after ${promptAfter ?? "never"} ms; row after ${rowAfter ?? "never"} ms (no tap)` });

  if (rowAfter === null && promptAfter !== null) {
    await andru.page.getByRole("button", { name: /reload|refresh|show/i }).filter({ visible: true }).first().click();
    await andru.page.waitForTimeout(2500);
  }
  if (rowAfter === null && promptAfter === null) await andru.page.reload();

  // The letter avatar on a row is the merchant's initial, not the person's —
  // attribution lives in the transaction's details.
  await row.first().click();
  const details = await andru.page.getByRole("dialog").filter({ visible: true }).last().innerText();
  expect(details, "details should say Geralyn added it").toMatch(/geralyn/i);
  expect(details, "details credit the wrong person").not.toMatch(/andru/i);

  expect(rowAfter ?? promptAfter, `Andru saw nothing within ${WAIT_MS / 1000}s`).not.toBeNull();
  expect.soft(rowAfter, `row appeared by itself after ${rowAfter ?? "never"} ms; a prompt appeared after ${promptAfter ?? "never"} ms`).not.toBeNull();

  await andru.context.close();
  await geralyn.context.close();
});
