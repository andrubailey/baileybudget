// Run after changing the database directly, so the live site (which caches
// every table until something changes inside the app) picks the change up.
//   node scripts/refresh-live-cache.mjs [url]
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const envFile = process.argv[3] ?? new URL("../.env.local", import.meta.url);
const key = readFileSync(envFile, "utf8").match(/^SUPABASE_SERVICE_ROLE_KEY=(.*)$/m)?.[1];
if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY not found in .env.local");

const url = process.argv[2] ?? "https://baileybudget.vercel.app";
const timestamp = String(Date.now());
const response = await fetch(`${url}/api/refresh-cache`, {
  method: "POST",
  headers: {
    "x-refresh-timestamp": timestamp,
    "x-refresh-signature": createHmac("sha256", key).update(timestamp).digest("hex"),
  },
});
console.log(response.status, await response.text());
if (!response.ok) process.exit(1);
