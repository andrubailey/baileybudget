"use client";

import { useEffect, useRef, useState } from "react";
import { RecapStory, type RecapData } from "@/app/(app)/weekly-recap-card";
import { SparkleIcon } from "@/app/(app)/sparkle-icon";

const DISMISS_KEY = "weekly-recap-dismissed";
// Fired once a reviewed recap's story has finished closing, so every
// component watching useShowRecap drops it right away instead of on the
// next reload.
const REVIEWED_EVENT = "budgetapp:recap-reviewed";

function readReviewedWeekKey(): string | null {
  try {
    return localStorage.getItem(DISMISS_KEY);
  } catch {
    return null; // localStorage unavailable
  }
}

// Whether this week's recap belongs in the top bar right now: only on
// Saturday (the viewer's own clock), and only until it's been reviewed.
// `?recap=1` skips the Saturday check, for previewing a recap on any day.
// Shared by WeeklyRecapAlert (its own trigger) and DataQualityBanner (whether
// the surrounding bar should render at all). Returns null until the
// localStorage/clock read resolves after mount, so both agree on the
// server-rendered (nothing-shown) state and never flash a reviewed recap.
export function useShowRecap(weekKey: string | undefined): boolean | null {
  const [state, setState] = useState<{ reviewedWeekKey: string | null; saturday: boolean; forced: boolean } | null>(
    null,
  );

  useEffect(() => {
    function sync() {
      setState({
        reviewedWeekKey: readReviewedWeekKey(),
        saturday: new Date().getDay() === 6,
        forced: new URLSearchParams(window.location.search).get("recap") === "1",
      });
    }
    // Syncing with localStorage and the clock (external systems) after mount.
    sync();
    // Reviewed in this tab or another one, or a tab left open across
    // midnight into (or out of) Saturday.
    window.addEventListener(REVIEWED_EVENT, sync);
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener(REVIEWED_EVENT, sync);
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
    };
  }, []);

  if (state === null) return null;
  if (weekKey === undefined) return false;
  return (state.saturday || state.forced) && state.reviewedWeekKey !== weekKey;
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
// should be visible via the same useShowRecap check.
export function WeeklyRecapAlert({ data }: { data: RecapData | null }) {
  const [open, setOpen] = useState(false);
  const show = useShowRecap(data?.weekKey);
  // Set when the story confirms a review; the bar is only told once the
  // story has finished its exit animation, so it isn't yanked away mid-close.
  const reviewedPending = useRef(false);

  useEffect(() => {
    // `?recap=1` also opens the story immediately, even if it was already
    // reviewed — for previewing a recap without waiting for Saturday.
    if (new URLSearchParams(window.location.search).get("recap") === "1") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the URL, an external system, after mount
      setOpen(true);
    }
  }, []);

  // An open story stays mounted even once it's been marked reviewed.
  if (!data || (show !== true && !open)) return null;

  return (
    <>
      {show === true && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          // Explicit color rather than inheriting the bar's text color — an
          // FYI nudge, not a caution, whether or not it's sharing the bar
          // with actual data-quality issues (see DataQualityBanner).
          className="flex shrink-0 items-center gap-1.5 text-accent underline-offset-2 hover:underline"
        >
          <SparkleIcon size={14} />
          Your weekly recap is ready
        </button>
      )}
      {open && (
        <RecapStory
          data={data}
          onClose={() => {
            setOpen(false);
            if (reviewedPending.current) {
              reviewedPending.current = false;
              window.dispatchEvent(new Event(REVIEWED_EVENT));
            }
          }}
          onReview={() => {
            markRecapReviewed(data.weekKey);
            reviewedPending.current = true;
          }}
        />
      )}
    </>
  );
}
