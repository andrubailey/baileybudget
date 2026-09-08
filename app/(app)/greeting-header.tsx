"use client";

import { useEffect, useState } from "react";

function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

// Renders a neutral default on the server (and on first client render, to
// match) then swaps in the real time-of-day greeting after mount, once the
// viewer's own local clock is available — a server-computed greeting would
// use the deploy region's clock instead of the person actually looking at it.
export function GreetingHeader({ firstName }: { firstName: string }) {
  const [greeting, setGreeting] = useState("Welcome back");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the viewer's own clock, an external system, after mount
    setGreeting(greetingForHour(new Date().getHours()));
  }, []);

  return (
    <div>
      <p className="text-sm font-medium text-text-muted">
        {greeting}, {firstName} <span aria-hidden="true">👋</span>
      </p>
      <h1 className="mt-1 text-2xl leading-tight font-semibold tracking-tight text-text sm:text-display">
        Here&apos;s your financial overview
      </h1>
    </div>
  );
}
