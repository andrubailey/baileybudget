import Link from "next/link";
import { expandEventsForRange } from "@/lib/calendar";
import { formatDate, formatTime } from "@/lib/format";
import { EmptyState } from "@/app/(app)/empty-state";
import { AssigneeBadge } from "@/app/(app)/calendar/assignee-badge";
import type { CalendarEvent } from "@/lib/types";

// The Overview page's entry point into the shared calendar — the calendar
// itself has no dedicated mobile tab (Budget/Accounts/Recent already fill
// the tab bar), so this card is how mobile actually reaches it, the same
// way Goals and Recurring stay reachable without their own tab slot.
export function TodayCard({ events }: { events: CalendarEvent[] }) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const weekOut = new Date();
  weekOut.setDate(weekOut.getDate() + 6);
  const upcoming = expandEventsForRange(events, todayIso, weekOut.toISOString().slice(0, 10)).slice(0, 4);

  return (
    <div className="card">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-heading text-text">Calendar</h2>
        <Link href="/calendar" className="text-xs font-medium text-text-faint transition-colors hover:text-text">
          View All
        </Link>
      </div>
      {upcoming.length === 0 ? (
        <EmptyState
          compact
          icon="list"
          message="Nothing on the calendar this week."
          action={
            <Link href="/calendar" className="text-xs font-medium text-accent underline underline-offset-2">
              Add an event
            </Link>
          }
        />
      ) : (
        <ul className="divide-y divide-border">
          {upcoming.map((occ) => (
            <li key={`${occ.event.id}-${occ.iso}`} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="flex min-w-0 items-center gap-1.5 truncate text-sm font-medium text-text">
                  {occ.event.assignee && <AssigneeBadge assignee={occ.event.assignee} />}
                  <span className="truncate">{occ.event.title}</span>
                </p>
                <p className="text-metadata truncate">
                  {occ.iso === todayIso ? "Today" : formatDate(occ.iso)}
                  {occ.event.start_time ? ` · ${formatTime(occ.event.start_time)}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
