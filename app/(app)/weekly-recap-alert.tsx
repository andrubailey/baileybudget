"use client";

import { useEffect, useRef, useState } from "react";
import { RecapStory, type RecapData } from "@/app/(app)/weekly-recap-card";

const DISMISS_KEY = "weekly-recap-dismissed";
// Fired when a recap is reviewed, cleared or restored, so every component
// watching it updates right away instead of on the next reload.
const REVIEWED_EVENT = "budgetapp:recap-reviewed";

function readReviewedWeekKey(): string | null {
  try {
    return localStorage.getItem(DISMISS_KEY);
  } catch {
    return null; // localStorage unavailable
  }
}

// Whether this week's recap has been reviewed or cleared. Null until the
// localStorage read resolves after mount, so the server-rendered
// (nothing-shown) state never flashes a reviewed recap.
function useRecapReviewed(weekKey: string | undefined): boolean | null {
  const [reviewedWeekKey, setReviewedWeekKey] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    function sync() {
      setReviewedWeekKey(readReviewedWeekKey());
    }
    // Syncing with localStorage (an external system) after mount.
    sync();
    window.addEventListener(REVIEWED_EVENT, sync);
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener(REVIEWED_EVENT, sync);
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
    };
  }, []);

  if (reviewedWeekKey === undefined || weekKey === undefined) return null;
  return reviewedWeekKey === weekKey;
}

function markRecapReviewed(weekKey: string) {
  try {
    localStorage.setItem(DISMISS_KEY, weekKey);
  } catch {
    // ignore
  }
}

// The weekly recap as a notification. A new one arrives every Saturday and
// stays `ready` until it's reviewed or cleared; `reviewed` is the opposite
// state, for the Cleared filter. `openStory` plays it, and `story` is the
// element to render (outside the notifications panel, so it outlives the
// panel closing).
export function useWeeklyRecap(data: RecapData | null) {
  const [open, setOpen] = useState(false);
  const reviewed = useRecapReviewed(data?.weekKey);
  // Set when the story confirms a review; notifications are only told once
  // the story has finished its exit animation.
  const reviewedPending = useRef(false);

  useEffect(() => {
    // `?recap=1` also opens the story immediately, even if it was already
    // reviewed — this is how Settings reopens one.
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

  return {
    ready: reviewed === false,
    reviewed: reviewed === true,
    openStory: () => setOpen(true),
    story,
    clear() {
      if (!data) return;
      markRecapReviewed(data.weekKey);
      window.dispatchEvent(new Event(REVIEWED_EVENT));
    },
    restore() {
      try {
        localStorage.removeItem(DISMISS_KEY);
      } catch {
        // ignore
      }
      window.dispatchEvent(new Event(REVIEWED_EVENT));
    },
  };
}
