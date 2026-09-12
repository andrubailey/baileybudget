"use client";

import { useEffect, useState } from "react";
import { RecapStory, type RecapData } from "@/app/(app)/weekly-recap-card";
import { SparkleIcon } from "@/app/(app)/sparkle-icon";

const DISMISS_KEY = "weekly-recap-dismissed";

// Whether this week's recap has already been reviewed — shared by
// WeeklyRecapAlert (to decide whether to render its own trigger) and
// DataQualityBanner (to decide whether the surrounding bar should render at
// all when there are no data-quality issues either). Returns null until the
// localStorage read resolves after mount, same "__unresolved__" pattern the
// data-quality banner itself uses, so both components agree on the
// server-rendered (nothing-shown) state and never fight over a flash of an
// empty bar or a reviewed recap briefly reappearing.
export function useIsRecapReviewed(weekKey: string | undefined): boolean | null {
  const [reviewedWeekKey, setReviewedWeekKey] = useState<string | null>("__unresolved__");

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(DISMISS_KEY);
    } catch {
      // ignore — localStorage unavailable
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing with localStorage, an external system, after mount
    setReviewedWeekKey(stored);
  }, []);

  if (reviewedWeekKey === "__unresolved__") return null;
  return weekKey !== undefined && reviewedWeekKey === weekKey;
}

function markRecapReviewed(weekKey: string) {
  try {
    localStorage.setItem(DISMISS_KEY, weekKey);
  } catch {
    // ignore
  }
}

// The weekly recap's entry in the top alerts bar — a plain link-styled
// button among the data-quality ones, not its own card. Renders the story
// itself when tapped; DataQualityBanner decides whether the bar as a whole
// should be visible via the same useIsRecapReviewed check.
export function WeeklyRecapAlert({ data }: { data: RecapData | null }) {
  const [open, setOpen] = useState(false);
  const reviewed = useIsRecapReviewed(data?.weekKey);

  useEffect(() => {
    // `?recap=1` forces the story open immediately, ignoring any prior
    // review — for previewing a recap without waiting for Saturday.
    if (new URLSearchParams(window.location.search).get("recap") === "1") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the URL, an external system, after mount
      setOpen(true);
    }
  }, []);

  if (!data || reviewed !== false) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex shrink-0 items-center gap-1.5 underline-offset-2 hover:underline"
      >
        <SparkleIcon size={14} />
        Your weekly recap is ready
      </button>
      {open && (
        <RecapStory
          data={data}
          onClose={() => setOpen(false)}
          onReview={() => markRecapReviewed(data.weekKey)}
        />
      )}
    </>
  );
}
