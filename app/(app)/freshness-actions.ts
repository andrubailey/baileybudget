"use server";

import { getTable } from "@/lib/snapshot";
import { activitySignature } from "@/lib/activity-signature";

// Not a perfect "anything in the whole database changed" signal — budgets,
// categories, and accounts can still change without moving this — but
// transactions are by far the most frequently-touched table in day-to-day
// use, and this goes through the same tag-invalidated snapshot cache every
// other read does, so it reflects whatever the other person's last write
// actually invalidated.
export async function getActivitySignature(): Promise<string> {
  return activitySignature(await getTable("transactions"));
}
