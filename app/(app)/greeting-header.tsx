"use client";

import { useEffect, useState } from "react";

function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

// Renders a neutral default on the server (and on first client render, to
// match) then swaps in the real time-of-day greeting and today's date after
// mount, once the viewer's own local clock is available — a server-computed
// value would use the deploy region's clock instead of the person actually
// looking at it. The date (not a financial-specific line) is deliberate:
// this page now fronts more than just money — the shared calendar lives
// here too — so the header shouldn't read as finance-only.
export function GreetingHeader({ firstName }: { firstName: string }) {
  const [greeting, setGreeting] = useState("Welcome back");
  // Non-breaking space so the heading holds its line height before the
  // real date lands, instead of collapsing and then jumping.
  const [dateLabel, setDateLabel] = useState(" ");

  useEffect(() => {
    const now = new Date();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the viewer's own clock, an external system, after mount
    setGreeting(greetingForHour(now.getHours()));
    setDateLabel(now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }));
  }, []);

  return (
    <div>
      <p className="text-sm font-medium text-text-muted">
        {greeting}, {firstName} <span aria-hidden="true">👋</span>
      </p>
      <h1 className="text-page-title mt-1 text-text">{dateLabel}</h1>
    </div>
  );
}
