"use client";

import { useEffect, useRef, useState } from "react";
import { RecapStory, type RecapData } from "@/app/(app)/weekly-recap-card";

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

// Whether this week's recap belongs in notifications right now: only on
// Saturday (the viewer's own clock), and only until it's been reviewed.
// `?recap=1` skips the Saturday check, for previewing a recap on any day.
// Returns null until the localStorage/clock read resolves after mount, so
// the server-rendered (nothing-shown) state never flashes a reviewed recap.
function useShowRecap(weekKey: string | undefined): boolean | null {
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

// The weekly recap as a notification: `ready` says whether it should be
// listed, `openStory` plays it, and `story` is the element to render (outside
// the notifications panel, so it outlives the panel closing).
export function useWeeklyRecap(data: RecapData | null) {
  const [open, setOpen] = useState(false);
  const show = useShowRecap(data?.weekKey);
  // Set when the story confirms a review; notifications are only told once
  // the story has finished its exit animation.
  const reviewedPending = useRef(false);

  useEffect(() => {
    // `?recap=1` also opens the story immediately, even if it was already
    // reviewed — for previewing a recap without waiting for Saturday.
    if (new URLSearchParams(window.location.search).get("recap") === "1") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the URL, an external system, after mount
      setOpen(true);
    }
  }, []);

  const story =
    data && open ? (
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
    ) : null;

  return { ready: !!data && show === true, openStory: () => setOpen(true), story };
}
