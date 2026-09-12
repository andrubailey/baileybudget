import http from "node:http";
import { Session } from "node:inspector/promises";
import { clock, record } from "@/lib/perf";

// Node-only half of lib/perf.ts: whole-request timing and the CPU profiler.
// Loaded from instrumentation.ts only when PROFILE=1.

type PerfServerState = { installed: boolean; session: Session | null };
const state: PerfServerState = ((globalThis as { __bbPerfServer?: PerfServerState }).__bbPerfServer ??= {
  installed: false,
  session: null,
});

// Times every HTTP request the server handles, from the 'request' event to
// the response's 'finish', with time to first body byte and bytes sent.
// Patching the prototype catches the server Next already created.
export function installRequestTiming() {
  if (state.installed) return;
  state.installed = true;
  const originalEmit = http.Server.prototype.emit;
  http.Server.prototype.emit = function emit(this: http.Server, event: string, ...args: unknown[]) {
    if (event === "request") {
      const req = args[0] as http.IncomingMessage;
      const res = args[1] as http.ServerResponse;
      const start = clock();
      let firstByteMs: number | null = null;
      let bytes = 0;
      const count = (chunk: unknown) => {
        if (firstByteMs === null) firstByteMs = clock() - start;
        if (typeof chunk === "string") bytes += Buffer.byteLength(chunk);
        else if (chunk && typeof (chunk as Uint8Array).byteLength === "number") bytes += (chunk as Uint8Array).byteLength;
      };
      const originalWrite = res.write;
      const originalEnd = res.end;
      res.write = function write(this: http.ServerResponse, chunk: unknown, ...rest: unknown[]) {
        count(chunk);
        return (originalWrite as (...a: unknown[]) => boolean).call(this, chunk, ...rest);
      } as typeof res.write;
      res.end = function end(this: http.ServerResponse, chunk?: unknown, ...rest: unknown[]) {
        if (chunk && typeof chunk !== "function") count(chunk);
        return (originalEnd as (...a: unknown[]) => http.ServerResponse).call(this, chunk, ...rest);
      } as typeof res.end;
      res.on("finish", () => {
        record("request", `${req.method} ${req.url}`, start, {
          status: res.statusCode,
          firstByteMs,
          bytes,
          rsc: req.headers["rsc"] === "1",
          prefetch: req.headers["next-router-prefetch"] === "1",
          action: typeof req.headers["next-action"] === "string",
          profileRun: req.headers["x-profile-run"] ?? null,
        });
      });
    }
    return (originalEmit as (this: http.Server, ...a: unknown[]) => boolean).call(this, event, ...args);
  } as typeof http.Server.prototype.emit;
}

export async function startCpuProfile() {
  if (state.session) await stopCpuProfile();
  const session = new Session();
  session.connect();
  await session.post("Profiler.enable");
  // 100µs sampling: fine enough to resolve per-request work of a few ms.
  await session.post("Profiler.setSamplingInterval", { interval: 100 });
  await session.post("Profiler.start");
  state.session = session;
}

export async function stopCpuProfile() {
  const session = state.session;
  if (!session) return null;
  const { profile } = await session.post("Profiler.stop");
  session.disconnect();
  state.session = null;
  return profile;
}
