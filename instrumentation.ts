// Runs once when the server starts. Only does anything for a profiling run
// (PROFILE=1) — see lib/perf.ts.
export async function register() {
  if (process.env.PROFILE !== "1" || process.env.NEXT_RUNTIME !== "nodejs") return;
  const { installRequestTiming } = await import("./lib/perf-server");
  installRequestTiming();
}
