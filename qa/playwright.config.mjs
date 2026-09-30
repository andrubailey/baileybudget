// Regression tests run against whatever `node cli.mjs up` started (any git
// ref, dev or --prod). One Playwright project per device in the matrix, so
//   npx playwright test --project=small
// runs a spec at that device, and no --project runs all four.

import { defineConfig } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DEVICES, contextOptions } from "./devices.mjs";

const stateFile = new URL("./.data/stack.json", import.meta.url);
const stack = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, "utf8")) : null;
if (!stack) console.warn("\n[qa] No QA stack running — start one with `node cli.mjs up` before running tests.\n");

export default defineConfig({
  testDir: "./tests",
  outputDir: "./test-results",
  // The stack is one shared fake backend; tests reset it, so run serially.
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL: stack?.appUrl,
    storageState: stack ? fileURLToPath(new URL(`./.data/auth/andru@${stack.port}.json`, import.meta.url)) : undefined,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: Object.keys(DEVICES).map((name) => ({
    name,
    use: { browserName: "chromium", ...contextOptions(name) },
  })),
});
