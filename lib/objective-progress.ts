// % of the way from start_date to end_date, based on today's date — a proxy
// for progress when an objective has no numeric target (linked account +
// goal) to track against instead. Shared by the Goals page list and the
// dashboard's featured-goal banner so both agree on what "progress" means
// for a goal with no linked account.
export function timeElapsedPct(
  start: string | null,
  end: string | null,
): number | null {
  if (!start || !end) return null;
  const startMs = new Date(`${start}T00:00:00Z`).getTime();
  const endMs = new Date(`${end}T00:00:00Z`).getTime();
  if (endMs <= startMs) return null;
  // Truncate "now" to the day — using the exact millisecond would make a
  // server-render and client-hydration value differ and trigger a hydration
  // mismatch wherever this is used from a client component.
  const todayIso = new Date().toISOString().slice(0, 10);
  const nowMs = new Date(`${todayIso}T00:00:00Z`).getTime();
  return Math.min(100, Math.max(0, ((nowMs - startMs) / (endMs - startMs)) * 100));
}
