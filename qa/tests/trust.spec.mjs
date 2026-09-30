// The defects that permanently cost trust: losing, duplicating or
// misstating a transaction. Rows are counted in the database (the QA mock),
// never inferred from what the UI claims happened.
//
// Selectors target the baseline /add screen; when the rebuild changes that
// screen, update the three locators in `addForm` — the assertions stay.

import { expect, liveRowsWithDescription, mock, test, unique } from "./helpers.mjs";

test.beforeEach(async ({}, testInfo) => {
  // Behavior, not layout: one device is enough (QA_ALL_DEVICES=1 for all).
  testInfo.skip(!process.env.QA_ALL_DEVICES && testInfo.project.name !== "small", "trust tests run on one device");
  // No data reset here on purpose: the app caches whole tables until one of
  // its own writes invalidates them, so wiping the mock behind a running app
  // leaves it showing stale data. Unique descriptions isolate these tests.
  await mock.faults({});
});

test.afterEach(async () => {
  await mock.faults({});
});

function addForm(page) {
  return {
    amount: page.locator('input[inputmode="decimal"]').first(),
    description: page.getByPlaceholder("Whole Foods"),
    save: page.getByRole("button", { name: /^Add expense/ }),
  };
}

async function fillExpense(page, { amount, description }) {
  await page.goto("/add");
  const form = addForm(page);
  await form.amount.fill(amount);
  await form.description.fill(description);
  return form;
}

test.describe("duplicates on retry", () => {
  test("a save that committed but reported failure, then retried by hand, leaves exactly one transaction", async ({ page }) => {
    const description = unique("retry");
    // The write lands in the database, then the connection drops before
    // the app hears back — so the app believes it failed.
    await mock.faults({ rules: [{ match: { method: "POST", path: "/rest/v1/transactions" }, action: "drop-after-commit", times: 1 }] });
    const form = await fillExpense(page, { amount: "42.17", description });

    await form.save.click();
    await expect(page.getByText(/couldn.t save/i)).toBeVisible();
    await expect(form.amount, "a failed save must keep what was typed").toHaveValue("42.17");

    await form.save.click(); // exactly what a person does after "Couldn't save"
    await expect(page.getByText(/logged/i).first()).toBeVisible();

    const rows = await liveRowsWithDescription(description);
    expect(rows, "one tap on Save plus one retry must not create two transactions").toHaveLength(1);
  });

  test("a save whose reply was lost, replayed from the offline queue, leaves exactly one transaction", async ({ page }) => {
    const description = unique("replay");
    const form = await fillExpense(page, { amount: "63.40", description });

    // The phone loses signal mid-request: the server receives and commits
    // the save, but the reply never makes it back.
    let dropped = false;
    await page.route("**/add", async (route) => {
      const req = route.request();
      if (!dropped && req.method() === "POST" && req.headers()["next-action"]) {
        dropped = true;
        await route.fetch();
        return route.abort("internetdisconnected");
      }
      return route.continue();
    });
    await form.save.click();
    await expect(page.getByText(/no connection|offline|queued|will send/i).first()).toBeVisible();
    await page.unroute("**/add");

    // Signal comes back and the app reopens — the queue replays.
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    const rows = await liveRowsWithDescription(description);
    expect(rows, "replaying a save that already landed must not duplicate it").toHaveLength(1);
  });

  test("double-tapping Save on a slow connection creates one transaction", async ({ page }) => {
    const description = unique("doubletap");
    await mock.faults({ rules: [{ match: { method: "POST", path: "/rest/v1/transactions" }, action: "delay", delayMs: 2500, times: 5 }] });
    const form = await fillExpense(page, { amount: "9.99", description });
    await form.save.click();
    await form.save.click({ force: true, timeout: 2000 }).catch(() => {}); // disabled is fine — that's the fix
    await page.waitForTimeout(6000);
    expect(await liveRowsWithDescription(description)).toHaveLength(1);
  });
});

test.describe("state continuity", () => {
  test("a half-typed transaction survives backgrounding the app (switching away, a call)", async ({ page }) => {
    const form = await fillExpense(page, { amount: "18.50", description: "half typed" });
    await page.evaluate(() => {
      const setVisibility = (v) => Object.defineProperty(document, "visibilityState", { value: v, configurable: true });
      setVisibility("hidden");
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
      setVisibility("visible");
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    });
    await page.waitForTimeout(1500);
    await expect(form.amount).toHaveValue("18.50");
    await expect(form.description).toHaveValue("half typed");
  });

  test("a half-typed transaction survives iOS reloading the app while you were away", async ({ page }) => {
    // iOS discards backgrounded PWAs under memory pressure; coming back is
    // a fresh page load. This is the "losing a half-typed transaction" case.
    const form = await fillExpense(page, { amount: "27.30", description: "typed before a phone call" });
    await page.reload();
    await expect(form.amount).toHaveValue("27.30");
    await expect(form.description).toHaveValue("typed before a phone call");
  });
});
