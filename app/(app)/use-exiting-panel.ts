"use client";

import { useEffect, useRef, useState } from "react";

// Open/close state for a panel that plays an exit animation: close() flags
// `closing` so the panel can animate out, and only clears `value` once the
// animation has had time to finish. Opening again mid-exit cancels the exit,
// so a new panel never arrives already sliding out and then vanishes.
export function useExitingPanel<T>(exitMs: number) {
  const [value, setValue] = useState<T | null>(null);
  const [closing, setClosing] = useState(false);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (exitTimer.current) clearTimeout(exitTimer.current);
    },
    [],
  );

  function open(next: T) {
    if (exitTimer.current) {
      clearTimeout(exitTimer.current);
      exitTimer.current = null;
    }
    setClosing(false);
    setValue(next);
  }

  function close() {
    if (exitTimer.current) return;
    setClosing(true);
    exitTimer.current = setTimeout(() => {
      exitTimer.current = null;
      setValue(null);
      setClosing(false);
    }, exitMs);
  }

  return { value, closing, open, close };
}
