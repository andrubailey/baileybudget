import { createHmac, timingSafeEqual } from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { SNAPSHOT_TABLES } from "@/lib/snapshot";

const MAX_AGE_MS = 5 * 60 * 1000;

function isSigned(request: NextRequest) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const timestamp = request.headers.get("x-refresh-timestamp") ?? "";
  const signature = request.headers.get("x-refresh-signature") ?? "";
  if (!secret || Math.abs(Date.now() - Number(timestamp)) > MAX_AGE_MS) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(timestamp).digest("hex"));
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

// Clears the household snapshot after the database is changed outside the
// app (see scripts/refresh-live-cache.mjs), which nothing else would notice.
// Signed with the service role key rather than a session; the key itself is
// never sent. Uses expire: 0 so the next page view can't get stale data.
export async function POST(request: NextRequest) {
  if (!isSigned(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  for (const table of SNAPSHOT_TABLES) revalidateTag(table, { expire: 0 });
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true, tables: SNAPSHOT_TABLES.length });
}
