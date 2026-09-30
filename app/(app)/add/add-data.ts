"use server";

import { getFrequentMerchants, type MerchantSuggestion } from "@/lib/queries";
import { getPeriods } from "@/lib/periods";
import {
  getCurrentSession,
  getHouseholdMembers,
  type HouseholdMember,
} from "@/lib/profile";
import type { Period } from "@/lib/types";

export type AddSheetData = {
  merchants: MerchantSuggestion[];
  members: HouseholdMember[];
  currentUserId: string | null;
  periods: Pick<Period, "id" | "start_date" | "end_date">[];
};

// The add sheet fetches these itself on open rather than taking them as props.
// It's mounted from two places — the /add route and the bottom nav's "+" — and
// the nav is a client component inside the shell, so threading four more props
// through would mean the whole shell re-fetching merchant history on every
// navigation just in case someone taps add. Nothing here is needed to type the
// amount, which is the first thing that happens, so arriving a beat late costs
// nothing.
export async function loadAddSheetData(): Promise<AddSheetData> {
  const [merchants, members, session, periods] = await Promise.all([
    getFrequentMerchants(),
    getHouseholdMembers(),
    getCurrentSession(),
    getPeriods(),
  ]);
  return {
    merchants,
    members,
    currentUserId: session?.user?.id ?? null,
    periods: periods.map((p) => ({
      id: p.id,
      start_date: p.start_date,
      end_date: p.end_date,
    })),
  };
}
