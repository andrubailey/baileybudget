"use client";

import { useEffect, useState } from "react";

const FORMAT: Intl.DateTimeFormatOptions = { weekday: "long", month: "long", day: "numeric" };

// "Tuesday, September 30" in the viewer's own timezone. The server only
// knows UTC, so it renders that first (identically on both sides, so no
// hydration mismatch) and the phone's local date replaces it after mount —
// the two only differ late in the evening.
export function LocalDateTitle({ serverIso }: { serverIso: string }) {
  const [label, setLabel] = useState(() =>
    new Date(`${serverIso}T12:00:00Z`).toLocaleDateString("en-US", { ...FORMAT, timeZone: "UTC" }),
  );
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the viewer's clock is an external system only readable after mount
    setLabel(new Date().toLocaleDateString("en-US", FORMAT));
  }, []);
  return <>{label}</>;
}
