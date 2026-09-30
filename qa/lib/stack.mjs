// Brings up (and tears down) an isolated copy of the app for QA:
//
//   1. a git worktree of the requested ref, OUTSIDE the repo (so the app's
//      tsconfig/eslint never see it and the parallel rebuild's uncommitted
//      files are never touched),
//   2. an .env.local in that worktree containing ONLY the QA mock's URL and
//      keys — the real Supabase credentials never exist there,
//   3. the mock Supabase loaded with the seed,
//   4. `next dev` (or build + start with --prod) on its own port,
//   5. a signed-in Playwright session per test user, saved for reuse.

import { execFileSync, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ANON_KEY, SERVICE_ROLE_KEY } from "../mock-supabase/keys.mjs";
import { TEST_USERS } from "../mock-supabase/test-users.mjs";

export const QA_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const APP_ROOT = resolve(QA_ROOT, "..");
// A sibling of the repo, deliberately not inside it.
export const WORKTREES = resolve(APP_ROOT, "..", ".budget-app-qa");
export const DATA = resolve(QA_ROOT, ".data");
const STATE_FILE = resolve(DATA, "stack.json");
const MOCK_PORT = 54321;

const git = (...args) => execFileSync("git", ["-C", APP_ROOT, ...args], { encoding: "utf8" }).trim();
const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function lanIp() {
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) if (a.family === "IPv4" && !a.internal) return a.address;
  }
  return null;
}

export function readState() {
  return existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, "utf8")) : null;
}

async function isUp(url) {
  try {
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(3000) });
    return res.status > 0;
  } catch {
    return false;
  }
}

async function waitFor(url, label, timeoutMs, logFile) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await isUp(url)) return;
    await sleep(750);
  }
  throw new Error(`${label} didn't come up at ${url} within ${Math.round(timeoutMs / 1000)}s — see ${logFile}`);
}

function spawnDetached(cmd, args, { cwd, env, logFile }) {
  mkdirSync(dirname(logFile), { recursive: true });
  const out = openSync(logFile, "a");
  const child = spawn(cmd, args, { cwd, env, detached: true, stdio: ["ignore", out, out] });
  child.unref();
  return child.pid;
}

function killGroup(pid, signal = "SIGTERM") {
  if (!pid) return;
  try {
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      // already gone
    }
  }
}

// Whether anything at all is listening on a local port.
function portInUse(port) {
  try {
    return execFileSync("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"], { encoding: "utf8" }).trim().length > 0;
  } catch {
    return false;
  }
}

// SIGTERM, then wait for the port to actually be released — spawning a new
// server while the old one still holds the port means the readiness check
// talks to the OLD process (and its stale data). Escalates to SIGKILL.
async function stopAndWait(pid, port) {
  killGroup(pid);
  for (let i = 0; i < 40 && portInUse(port); i++) await sleep(250);
  if (portInUse(port)) {
    killGroup(pid, "SIGKILL");
    for (let i = 0; i < 20 && portInUse(port); i++) await sleep(250);
  }
  if (portInUse(port)) throw new Error(`Port ${port} is still in use by another process — free it and retry (lsof -ti tcp:${port}).`);
}

export function ensureSeed(seedRel, scale = 1) {
  const seedPath = resolve(QA_ROOT, seedRel);
  if (!existsSync(seedPath)) {
    execFileSync("node", [resolve(QA_ROOT, "seed/generate.mjs"), `--out=${seedRel}`, `--scale=${scale}`], { cwd: QA_ROOT, stdio: "inherit" });
  }
  return seedPath;
}

function ensureWorktree(sha) {
  const dir = resolve(WORKTREES, sha.slice(0, 10));
  if (!existsSync(dir)) {
    mkdirSync(WORKTREES, { recursive: true });
    git("worktree", "add", "--detach", dir, sha);
  } else {
    const head = execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    if (head !== sha) execFileSync("git", ["-C", dir, "checkout", "--detach", sha], { stdio: "inherit" });
  }

  // Reuse the main checkout's installed packages when the lockfile matches
  // (an APFS clone — instant, no network); otherwise install for real.
  const lockAtRef = execFileSync("git", ["-C", dir, "show", `${sha}:package-lock.json`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const lockMain = readFileSync(resolve(APP_ROOT, "package-lock.json"), "utf8");
  const nodeModules = resolve(dir, "node_modules");
  const lockMarker = resolve(dir, ".qa-lock-hash");
  const wantHash = sha256(lockAtRef);
  const haveHash = existsSync(lockMarker) ? readFileSync(lockMarker, "utf8") : null;
  if (!existsSync(nodeModules) || haveHash !== wantHash) {
    rmSync(nodeModules, { recursive: true, force: true });
    if (sha256(lockMain) === wantHash) {
      execFileSync("cp", ["-Rc", resolve(APP_ROOT, "node_modules"), nodeModules]);
    } else {
      execFileSync("npm", ["ci", "--prefer-offline", "--no-audit", "--no-fund"], { cwd: dir, stdio: "inherit" });
    }
    writeFileSync(lockMarker, wantHash);
  }
  return dir;
}

function writeEnv(dir, mockUrl) {
  const env = [
    "# Written by qa/lib/stack.mjs — points ONLY at the QA mock Supabase.",
    "# The real project's credentials must never appear in this worktree.",
    `NEXT_PUBLIC_SUPABASE_URL=${mockUrl}`,
    `NEXT_PUBLIC_SUPABASE_ANON_KEY=${ANON_KEY}`,
    `SUPABASE_SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}`,
    "",
  ].join("\n");
  if (/supabase\.co/i.test(env)) throw new Error("Refusing to write a QA env that points at a hosted Supabase project.");
  writeFileSync(resolve(dir, ".env.local"), env);

  // The app caches whole tables in Next's Data Cache with no expiry, and
  // Next 16 keeps the dev server's copy under .next/dev/ (not .next/cache),
  // so the only reliable reset is a clean .next every run — otherwise the
  // app serves the PREVIOUS seed while the mock serves the new one. Also
  // covers NEXT_PUBLIC_* values being baked into client bundles.
  rmSync(resolve(dir, ".next"), { recursive: true, force: true });
  writeFileSync(resolve(dir, ".qa-mode"), mockUrl);
}

function appEnv(mockUrl) {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_WORKSPACE_ID;
  return {
    ...env,
    NEXT_PUBLIC_SUPABASE_URL: mockUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
    NEXT_TELEMETRY_DISABLED: "1",
  };
}

export async function signIn(appUrl, userKey, storagePath) {
  const { chromium } = await import("@playwright/test");
  const u = TEST_USERS[userKey];
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ baseURL: appUrl });
    const page = await ctx.newPage();
    await page.goto("/login", { timeout: 120000 });
    await page.fill("#email", u.email);
    await page.fill("#password", u.password);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 180000 });
    mkdirSync(dirname(storagePath), { recursive: true });
    await ctx.storageState({ path: storagePath });
  } finally {
    await browser.close();
  }
}

export function authStatePath(port, userKey) {
  return resolve(DATA, "auth", `${userKey}@${port}.json`);
}

export async function up({ ref = "HEAD", port = 3200, seed = ".data/seed.json", prod = false, lan = false } = {}) {
  const sha = git("rev-parse", "--verify", `${ref}^{commit}`);
  const seedPath = ensureSeed(seed);
  const host = lan ? lanIp() : "127.0.0.1";
  if (lan && !host) throw new Error("--lan: couldn't find a LAN IPv4 address on this machine.");
  const mockUrl = `http://${host}:${MOCK_PORT}`;
  const appUrl = lan ? `http://${host}:${port}` : `http://localhost:${port}`;

  await down({ quiet: true });

  console.log(`→ worktree for ${ref} (${sha.slice(0, 10)})`);
  const dir = ensureWorktree(sha);
  writeEnv(dir, mockUrl);

  for (const p of [MOCK_PORT, port]) {
    if (portInUse(p)) throw new Error(`Port ${p} is already in use by something this tool didn't start — free it first (lsof -ti tcp:${p}).`);
  }

  console.log(`→ mock Supabase ${mockUrl} with ${seedPath}`);
  const mockLog = resolve(DATA, "logs/mock.log");
  const bootId = randomUUID();
  const mockPid = spawnDetached("node", [resolve(QA_ROOT, "mock-supabase/server.mjs"), `--seed=${seedPath}`, `--port=${MOCK_PORT}`, `--host=${lan ? "0.0.0.0" : "127.0.0.1"}`, `--public-url=${mockUrl}`, `--boot-id=${bootId}`], { cwd: QA_ROOT, env: process.env, logFile: mockLog });
  await waitFor(`${mockUrl}/__qa/state`, "mock Supabase", 15000, mockLog);
  const booted = await (await fetch(`${mockUrl}/__qa/state`)).json();
  if (booted.bootId !== bootId) throw new Error(`A different mock Supabase answered on ${mockUrl} (stale process?) — see ${mockLog}`);

  const appLog = resolve(DATA, `logs/app-${port}.log`);
  const next = resolve(dir, "node_modules/.bin/next");
  const hostArgs = lan ? ["-H", "0.0.0.0"] : ["-H", "localhost"];
  if (prod) {
    console.log("→ next build (production, for performance numbers)…");
    execFileSync(next, ["build"], { cwd: dir, env: appEnv(mockUrl), stdio: "inherit" });
  }
  console.log(`→ ${prod ? "next start" : "next dev"} on ${appUrl}`);
  const appPid = spawnDetached(next, [prod ? "start" : "dev", "-p", String(port), ...hostArgs], { cwd: dir, env: appEnv(mockUrl), logFile: appLog });
  writeFileSync(STATE_FILE, JSON.stringify({ ref, sha, dir, port, prod, lan, seed: seedPath, mockUrl, appUrl, pids: { mock: mockPid, app: appPid }, startedAt: new Date().toISOString() }, null, 2));
  await waitFor(`${appUrl}/login`, "the app", 240000, appLog);

  console.log("→ signing in the test users (first load compiles, can take a minute)…");
  for (const userKey of Object.keys(TEST_USERS)) await signIn(appUrl, userKey, authStatePath(port, userKey));

  console.log(`\nReady: ${appUrl}  (seed as-of ${JSON.parse(readFileSync(seedPath, "utf8")).meta.as_of})`);
  if (lan) console.log(`On your phone (same Wi-Fi): open ${appUrl} and sign in with a test user (emails in qa/mock-supabase/test-users.mjs, passwords in qa/.data/test-passwords.json)`);
  return readState();
}

export async function down({ quiet = false } = {}) {
  const state = readState();
  if (!state) return;
  await stopAndWait(state.pids?.app, state.port);
  await stopAndWait(state.pids?.mock, MOCK_PORT);
  rmSync(STATE_FILE, { force: true });
  if (!quiet) console.log(`Stopped app (${state.appUrl}) and mock Supabase.`);
}
