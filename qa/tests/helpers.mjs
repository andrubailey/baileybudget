// Shared test fixtures: talk to the QA mock, apply device safe areas, and
// read the rows a screen should be showing.

import { test as base, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { applySafeArea } from "../devices.mjs";
import { HIDE_DEV_OVERLAY } from "../lib/audit.mjs";

export const stack = JSON.parse(readFileSync(new URL("../.data/stack.json", import.meta.url), "utf8"));
export const authState = (user = "andru") => fileURLToPath(new URL(`../.data/auth/${user}@${stack.port}.json`, import.meta.url));

export const mock = {
  async reset(seed) {
    const res = await fetch(`${stack.mockUrl}/__qa/reset`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(seed ? { seed } : {}) });
    return res.json();
  },
  async faults(config) {
    await fetch(`${stack.mockUrl}/__qa/faults`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(config ?? {}) });
  },
  async table(name) {
    return (await fetch(`${stack.mockUrl}/__qa/table/${name}`)).json();
  },
  async state() {
    return (await fetch(`${stack.mockUrl}/__qa/state`)).json();
  },
};

// The fixture callback is named `provide` rather than Playwright's usual
// `use` so the app's React hooks lint rule doesn't mistake it for a hook.
export const test = base.extend({
  page: async ({ page }, provide, testInfo) => {
    await page.addInitScript(HIDE_DEV_OVERLAY);
    await applySafeArea(page, testInfo.project.name);
    await provide(page);
  },
});

export { expect };

// A description nobody would type, so row counts can't collide with seed data.
export const unique = (label) => `QA ${label} ${Date.now().toString(36)}`;

export async function liveRowsWithDescription(description) {
  return (await mock.table("transactions")).filter((t) => t.description === description && !t.deleted_at);
}
