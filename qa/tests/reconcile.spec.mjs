// Reconcile: the gap it shows is (statement − app balance), fixing it lands
// the balance exactly on the statement figure, and the correction doesn't
// leak into the month's income or spending — a bookkeeping fix isn't money
// earned or spent.
//
// Mutates data (adds adjustment rows), so it runs after the read-only specs.

import { amountAfter, balances, round2 } from "../lib/finance.mjs";
import { expect, mock, test } from "./helpers.mjs";

test.beforeEach(async ({}, testInfo) => {
  testInfo.skip(testInfo.project.name !== "large", "numbers don't depend on the device");
});

async function overviewFlows(page) {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const text = await page.evaluate(() => (document.querySelector("main") ?? document.body).innerText);
  return { income: amountAfter(text, "Monthly Income"), expenses: amountAfter(text, "Monthly Expenses") };
}

async function reconcile(page, accountName, statement) {
  await page.goto("/balances");
  await page.getByRole("button", { name: `Reconcile ${accountName}` }).first().click();
  const dialog = page.getByRole("dialog").filter({ visible: true }).last();
  const input = dialog.locator("input").filter({ visible: true }).first();
  await input.fill(String(statement));
  await dialog.getByRole("button", { name: /check balance/i }).click();
  const fix = dialog.getByRole("button", { name: /fix the balance|adjust|save/i }).first();
  await expect(fix, "the gap result never appeared after entering the statement balance").toBeVisible();
  const gapText = await dialog.innerText();
  await fix.click();
  await expect(dialog).toBeHidden();
  return gapText;
}

for (const { name, bump, label } of [
  { name: "Personal Checking", bump: 123.45, label: "checking, bank shows more" },
  { name: "Personal Checking", bump: -60.0, label: "checking, bank shows less" },
  { name: "Delta SkyMiles Blue Cash Everyday Amex", bump: -41.07, label: "credit card, owe less than the app thinks" },
  { name: "Delta SkyMiles Blue Cash Everyday Amex", bump: 18.2, label: "credit card, owe more than the app thinks" },
]) {
  test(`reconcile ${label}: gap is right, balance lands on the statement, month totals don't move`, async ({ page }) => {
    const before = await mock.table("accounts").then(async (accounts) => {
      const t = { accounts, transactions: await mock.table("transactions"), transaction_splits: await mock.table("transaction_splits") };
      const account = accounts.find((a) => a.name === name);
      return { account, balance: balances(t).get(account.id) };
    });
    const statement = round2(before.balance + bump);
    const flowsBefore = await overviewFlows(page);

    const gapText = await reconcile(page, name, statement.toFixed(2));
    expect(gapText, "gap shown").toContain(`${bump > 0 ? "+" : "-"}$${Math.abs(bump).toFixed(2)}`);

    const t = { accounts: await mock.table("accounts"), transactions: await mock.table("transactions"), transaction_splits: await mock.table("transaction_splits") };
    expect(balances(t).get(before.account.id), "balance after the adjustment").toBeCloseTo(statement, 2);

    await page.goto("/balances");
    const shown = amountAfter(await page.evaluate(() => document.body.innerText), name);
    expect(Math.abs(shown), "balance shown on the Accounts tab").toBeCloseTo(Math.abs(statement), 2);

    const flowsAfter = await overviewFlows(page);
    expect.soft(flowsAfter.income, "Overview → Monthly Income changed after a reconcile adjustment").toBeCloseTo(flowsBefore.income, 2);
    expect.soft(flowsAfter.expenses, "Overview → Monthly Expenses changed after a reconcile adjustment").toBeCloseTo(flowsBefore.expenses, 2);
  });
}
