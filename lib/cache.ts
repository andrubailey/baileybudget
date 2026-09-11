import { revalidatePath, revalidateTag, updateTag } from "next/cache";
import { SNAPSHOT_TABLES, type SnapshotTable } from "@/lib/snapshot";

// Call after any write. Throws away the cached snapshot for the given
// tables (all of them by default — over-invalidating is cheap, a stale
// number on the dashboard is not) and tells the client router that every
// page is stale, so the next navigation re-renders from fresh data.
//
// `updateTag` expires an entry immediately and is only allowed inside a
// Server Action; a Route Handler (the Shortcuts API) has to use
// `revalidateTag`, which marks it stale-while-revalidate instead. Trying
// the strict one first covers both callers with one helper.
export function revalidateHousehold(tables: readonly SnapshotTable[] = SNAPSHOT_TABLES) {
  for (const table of tables) {
    try {
      updateTag(table);
    } catch {
      revalidateTag(table, "max");
    }
  }
  revalidatePath("/", "layout");
}
