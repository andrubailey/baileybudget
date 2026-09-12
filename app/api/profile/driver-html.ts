// The profiling driver, served at /api/profile?op=ui. It runs in the
// signed-in browser so every request carries a real session, makes requests
// one at a time (so each drained batch of spans belongs to exactly one
// request), and saves everything to .profile/ for scripts/profile-report.mjs.
//
// Passes:
//   warm  — steady state: Data Cache populated, JIT warm. Each route as a
//           full document load and as an RSC payload (a client navigation).
//   cold  — every snapshot table expired right before the request: the
//           render that follows any write.
//   cpu   — the in-process CPU profiler around a batch of warm RSC requests
//           per route, for the CPU split of render/framework time.
//   browse capture — record everything the server does while you click
//           around normally (prefetches, server actions included).
//
// Query params: runs (warm + cpu, default 10), cold (default 4),
// routes (comma-separated, default the main pages).

export const DRIVER_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Bailey Budget profiler</title>
<style>
  body { font: 14px/1.5 -apple-system, system-ui, sans-serif; margin: 32px; color: #111; max-width: 820px; }
  button { font: inherit; padding: 8px 14px; margin: 0 8px 8px 0; border-radius: 8px; border: 1px solid #ccc; background: #fff; cursor: pointer; }
  button.primary { background: #5b8a00; color: #fff; border-color: #5b8a00; }
  button:disabled { opacity: .5; cursor: default; }
  pre { background: #f4f4f2; padding: 12px; border-radius: 8px; white-space: pre-wrap; min-height: 120px; }
  code { background: #f4f4f2; padding: 1px 4px; border-radius: 4px; }
</style>
</head>
<body>
<h1>Profiler</h1>
<p>Runs sequential requests against this server and saves spans and CPU profiles to <code>.profile/</code>.
Then run <code>npm run profile:report</code>.</p>
<p>
  <button class="primary" id="run">Run standard pass</button>
  <button id="capture-start">Start browse capture</button>
  <button id="capture-save" disabled>Save browse capture</button>
</p>
<pre id="out"></pre>
<script>
const out = document.getElementById("out");
const log = (m) => { out.textContent += m + "\\n"; };
const params = new URLSearchParams(location.search);
const RUNS = Number(params.get("runs") || 10);
const COLD_RUNS = Number(params.get("cold") || 4);
const ROUTES = (params.get("routes") || "/,/spending,/spending/breakdown,/transactions,/accounts").split(",");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(op, query = "") {
  const res = await fetch("/api/profile?op=" + op + query, { cache: "no-store" });
  if (!res.ok) throw new Error(op + " failed: " + res.status);
  return res.json();
}

async function request(route, mode) {
  const headers = mode === "rsc" ? { RSC: "1" } : { Accept: "text/html" };
  const t0 = performance.now();
  const res = await fetch(route, { headers, cache: "no-store", redirect: "manual" });
  const tHeaders = performance.now();
  const body = await res.arrayBuffer();
  const t1 = performance.now();
  if (res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400)) {
    throw new Error(route + " redirected — sign in to the app in this browser first");
  }
  return { route, mode, status: res.status, clientMs: t1 - t0, clientTtfbMs: tHeaders - t0, bytes: body.byteLength };
}

async function measured(phase, route, mode) {
  await api("reset");
  const result = await request(route, mode);
  // Let the response's 'finish' event land before draining.
  await sleep(25);
  const spans = await api("drain");
  return { phase, ...result, spans };
}

document.getElementById("run").onclick = async (event) => {
  event.target.disabled = true;
  out.textContent = "";
  const results = { startedAt: new Date().toISOString(), userAgent: navigator.userAgent, runs: RUNS, coldRuns: COLD_RUNS, routes: ROUTES, requests: [], cpu: [] };
  try {
    log("Warming up (Data Cache + JIT)…");
    for (let i = 0; i < 3; i++) for (const route of ROUTES) { await request(route, "document"); await request(route, "rsc"); }

    for (const route of ROUTES) {
      log("warm  " + route);
      for (let i = 0; i < RUNS; i++) {
        results.requests.push(await measured("warm", route, "document"));
        results.requests.push(await measured("warm", route, "rsc"));
      }
    }

    for (const route of ROUTES) {
      log("cold  " + route + "  (all tables expired first)");
      for (let i = 0; i < COLD_RUNS; i++) {
        await api("invalidate", "&tables=all");
        results.requests.push(await measured("cold", route, "rsc"));
      }
    }
    // Repopulate the cache before the CPU pass.
    for (const route of ROUTES) await request(route, "rsc");

    for (const route of ROUTES) {
      log("cpu   " + route);
      await request(route, "rsc");
      const name = "latest-cpu-" + (route === "/" ? "overview" : route.slice(1).replaceAll("/", "-"));
      await api("reset");
      await api("cpu-start");
      const t0 = performance.now();
      for (let i = 0; i < RUNS; i++) await request(route, "rsc");
      const wallMs = performance.now() - t0;
      const stop = await api("cpu-stop", "&name=" + name);
      const spans = await api("drain");
      results.cpu.push({ route, name, requests: RUNS, wallMs, file: stop.file, spans });
    }

    await fetch("/api/profile?name=latest", { method: "POST", body: JSON.stringify(results) });
    log("\\nSaved .profile/latest.json. Now run: npm run profile:report");
  } catch (error) {
    log("\\nStopped: " + error.message);
  } finally {
    event.target.disabled = false;
  }
};

let captureStartedAt = null;
document.getElementById("capture-start").onclick = async () => {
  await api("reset");
  captureStartedAt = new Date().toISOString();
  document.getElementById("capture-save").disabled = false;
  log("Browse capture started " + captureStartedAt + ". Use the app in another tab, then come back and save.");
};
document.getElementById("capture-save").onclick = async () => {
  const spans = await api("drain");
  const visited = prompt("Pages you actually opened, comma-separated (e.g. /,/spending,/transactions)", "") || "";
  const body = { startedAt: captureStartedAt, savedAt: new Date().toISOString(), visited: visited.split(",").map((s) => s.trim()).filter(Boolean), spans };
  await fetch("/api/profile?name=browse", { method: "POST", body: JSON.stringify(body) });
  log("Saved .profile/browse.json (" + spans.length + " spans).");
};
</script>
</body>
</html>`;
