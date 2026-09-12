import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PROFILING, drainSpans, type PerfSpan } from "@/lib/perf";
import { SNAPSHOT_TABLES } from "@/lib/snapshot";
import { DRIVER_HTML } from "./driver-html";

// Control surface for a profiling run. Returns 404 unless the server was
// started with PROFILE=1, and like every other route it's behind the auth
// proxy. Open /api/profile?op=ui to run the standard pass.
//
//   op=ui          the driver page
//   op=reset       discard collected spans
//   op=drain       return (and clear) collected spans
//   op=invalidate  expire snapshot tables now (&tables=all or a,b)
//   op=cpu-start   start the in-process CPU profiler
//   op=cpu-stop    stop it and write .profile/<name>.cpuprofile
//   POST ?name=x   write the request body to .profile/<x>.json

export const dynamic = "force-dynamic";

const OUT_DIR = path.join(process.cwd(), ".profile");
const SAFE_NAME = /^[\w.-]{1,80}$/;

function isProfilerTraffic(span: PerfSpan) {
  return span.name.includes("/api/profile") || String(span.meta?.path ?? "").startsWith("/api/profile");
}

const notFound = () => new NextResponse("Not found", { status: 404 });
const badRequest = (error: string) => NextResponse.json({ ok: false, error }, { status: 400 });

export async function GET(request: NextRequest) {
  if (!PROFILING) return notFound();
  const params = request.nextUrl.searchParams;

  switch (params.get("op")) {
    case "ui":
      return new NextResponse(DRIVER_HTML, { headers: { "content-type": "text/html; charset=utf-8" } });
    case "reset":
      drainSpans();
      return NextResponse.json({ ok: true });
    case "drain":
      return NextResponse.json(drainSpans().filter((span) => !isProfilerTraffic(span)));
    case "invalidate": {
      const requested = (params.get("tables") ?? "all").split(",");
      const tables = requested.includes("all")
        ? [...SNAPSHOT_TABLES]
        : SNAPSHOT_TABLES.filter((table) => requested.includes(table));
      for (const table of tables) revalidateTag(table, { expire: 0 });
      return NextResponse.json({ ok: true, tables });
    }
    case "cpu-start": {
      const { startCpuProfile } = await import("@/lib/perf-server");
      await startCpuProfile();
      return NextResponse.json({ ok: true });
    }
    case "cpu-stop": {
      const name = params.get("name") ?? `cpu-${Date.now()}`;
      if (!SAFE_NAME.test(name)) return badRequest("Invalid name");
      const { stopCpuProfile } = await import("@/lib/perf-server");
      const profile = await stopCpuProfile();
      if (!profile) return NextResponse.json({ ok: false, error: "No profile running" }, { status: 409 });
      await mkdir(OUT_DIR, { recursive: true });
      const file = path.join(OUT_DIR, `${name}.cpuprofile`);
      await writeFile(file, JSON.stringify(profile));
      return NextResponse.json({ ok: true, file, samples: profile.samples?.length ?? 0 });
    }
    default:
      return badRequest("Unknown op — see app/api/profile/route.ts");
  }
}

export async function POST(request: NextRequest) {
  if (!PROFILING) return notFound();
  const name = request.nextUrl.searchParams.get("name") ?? "latest";
  if (!SAFE_NAME.test(name)) return badRequest("Invalid name");
  await mkdir(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, `${name}.json`);
  await writeFile(file, await request.text());
  return NextResponse.json({ ok: true, file });
}
