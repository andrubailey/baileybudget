"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  buildMonthGrid,
  currentMonthIso,
  expandEventsForRange,
  monthLabel,
  shiftMonth,
  type EventOccurrence,
} from "@/lib/calendar";
import { formatDate, formatTime } from "@/lib/format";
import { useContextMenu, type ContextMenuItem } from "@/app/(app)/context-menu";
import { MenuGlyph } from "@/app/(app)/transaction-menu";
import { useToast } from "@/app/(app)/toast";
import { deleteCalendarEvent, restoreCalendarEvent } from "./actions";
import { AddCalendarEventForm, EditCalendarEventForm } from "./calendar-event-form";
import { AssigneeBadge } from "./assignee-badge";
import type { CalendarEvent } from "@/lib/types";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type ModalState = { mode: "add"; date?: string } | { mode: "edit"; id: string } | null;

// A month grid (see lib/calendar.ts for the day-math) plus a day-detail list
// below it for whichever day is selected — the grid alone can't fit an
// event's time/notes, so tapping a day expands into the full list instead
// of trying to cram everything into a ~40px cell.
export function CalendarView({ events, monthIso }: { events: CalendarEvent[]; monthIso: string }) {
  const router = useRouter();
  const [modal, setModal] = useState<ModalState>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [undoEvent, setUndoEvent] = useState<{ id: string; title: string } | null>(null);
  const showToast = useToast();
  const contextMenu = useContextMenu();

  const cells = buildMonthGrid(monthIso);
  const occurrences = expandEventsForRange(events, cells[0].iso, cells[cells.length - 1].iso);
  const byDay = new Map<string, EventOccurrence[]>();
  for (const occ of occurrences) {
    const list = byDay.get(occ.iso) ?? [];
    list.push(occ);
    byDay.set(occ.iso, list);
  }

  const editingEvent = modal?.mode === "edit" ? events.find((e) => e.id === modal.id) : undefined;
  const selectedDayEvents = selectedDay ? (byDay.get(selectedDay) ?? []) : [];

  function goToMonth(next: string) {
    router.push(`/calendar?month=${next}`);
  }

  async function handleDelete(event: CalendarEvent) {
    setModal(null);
    await deleteCalendarEvent(event.id);
    showToast(`${event.title} deleted`);
    setUndoEvent({ id: event.id, title: event.title });
    setTimeout(() => {
      setUndoEvent((current) => (current?.id === event.id ? null : current));
    }, 8000);
  }

  async function handleUndo() {
    if (!undoEvent) return;
    await restoreCalendarEvent(undoEvent.id);
    showToast(`${undoEvent.title} restored`);
    setUndoEvent(null);
  }

  function eventMenuItems(occ: EventOccurrence): ContextMenuItem[] {
    return [
      {
        label: "Edit event",
        icon: <MenuGlyph d="M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4" />,
        onSelect: () => setModal({ mode: "edit", id: occ.event.id }),
      },
      { type: "divider" },
      {
        label: "Delete event",
        icon: <MenuGlyph d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3" />,
        tone: "danger",
        onSelect: () => handleDelete(occ.event),
      },
    ];
  }

  return (
    <div className="space-y-4">
      {undoEvent && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-accent-border bg-accent-soft px-3 py-2 text-sm">
          <span className="text-accent">Deleted &ldquo;{undoEvent.title}&rdquo;.</span>
          <button
            type="button"
            onClick={handleUndo}
            className="font-semibold text-accent underline underline-offset-2 hover:text-accent-bright"
          >
            Undo
          </button>
        </div>
      )}

      <div className="card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => goToMonth(shiftMonth(monthIso, -1))}
              aria-label="Previous month"
              className="flex size-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-bg hover:text-text"
            >
              ‹
            </button>
            <h2 className="text-heading min-w-36 text-center text-text">{monthLabel(monthIso)}</h2>
            <button
              type="button"
              onClick={() => goToMonth(shiftMonth(monthIso, 1))}
              aria-label="Next month"
              className="flex size-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-bg hover:text-text"
            >
              ›
            </button>
          </div>
          <div className="flex items-center gap-3">
            {monthIso !== currentMonthIso() && (
              <button
                type="button"
                onClick={() => goToMonth(currentMonthIso())}
                className="text-xs font-medium text-text-faint hover:text-text"
              >
                Today
              </button>
            )}
            <button
              type="button"
              onClick={() => setModal({ mode: "add", date: selectedDay ?? undefined })}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
            >
              + Add event
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 text-center text-[11px] font-medium text-text-faint">
          {WEEKDAYS.map((w) => (
            <span key={w} className="pb-1.5">
              {w}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((cell) => {
            const dayEvents = byDay.get(cell.iso) ?? [];
            return (
              <button
                key={cell.iso}
                type="button"
                onClick={() => setSelectedDay(cell.iso)}
                className={`flex min-h-20 flex-col items-start gap-1 rounded-lg border p-1.5 text-left transition-colors ${
                  cell.iso === selectedDay ? "border-accent bg-accent-soft/40" : "border-border hover:bg-bg"
                } ${cell.inMonth ? "" : "opacity-40"}`}
              >
                <span
                  className={`flex size-6 items-center justify-center rounded-full text-xs ${
                    cell.isToday ? "bg-accent font-semibold text-white" : "text-text-muted"
                  }`}
                >
                  {cell.day}
                </span>
                <div className="flex w-full flex-col gap-0.5">
                  {dayEvents.slice(0, 2).map((occ) => (
                    <span
                      key={`${occ.event.id}-${occ.iso}`}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        contextMenu.open(e, eventMenuItems(occ));
                      }}
                      className="flex min-w-0 items-center gap-1 rounded bg-accent-soft px-1 py-0.5 text-[10px] font-medium text-accent"
                    >
                      {occ.event.assignee && <AssigneeBadge assignee={occ.event.assignee} size="xs" />}
                      <span className="truncate">{occ.event.title}</span>
                    </span>
                  ))}
                  {dayEvents.length > 2 && (
                    <span className="text-[10px] text-text-faint">+{dayEvents.length - 2} more</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selectedDay && (
        <div className="card">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-section-label">{formatDate(selectedDay)}</p>
            <button
              type="button"
              onClick={() => setModal({ mode: "add", date: selectedDay })}
              className="text-xs font-medium text-accent underline underline-offset-2"
            >
              + Add event
            </button>
          </div>
          {selectedDayEvents.length === 0 ? (
            <p className="text-sm text-text-muted">Nothing on the calendar this day.</p>
          ) : (
            <ul className="divide-y divide-border">
              {selectedDayEvents.map((occ) => (
                <li
                  key={`${occ.event.id}-${occ.iso}`}
                  onContextMenu={(e) => contextMenu.open(e, eventMenuItems(occ))}
                >
                  <button
                    type="button"
                    onClick={() => setModal({ mode: "edit", id: occ.event.id })}
                    className="block w-full py-2.5 text-left"
                  >
                    <p className="flex min-w-0 items-center gap-1.5 truncate text-sm font-medium text-text">
                      {occ.event.assignee && <AssigneeBadge assignee={occ.event.assignee} />}
                      <span className="truncate">{occ.event.title}</span>
                    </p>
                    {(occ.event.start_time || occ.event.notes) && (
                      <p className="text-metadata truncate">
                        {occ.event.start_time && formatTime(occ.event.start_time)}
                        {occ.event.start_time && occ.event.notes ? " · " : ""}
                        {occ.event.notes}
                      </p>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {contextMenu.menu}
      {modal && (
        <CalendarEventModal
          title={editingEvent ? editingEvent.title : "New event"}
          onClose={() => setModal(null)}
        >
          {editingEvent ? (
            <div className="space-y-5">
              <EditCalendarEventForm
                event={editingEvent}
                onDone={(message) => {
                  setModal(null);
                  if (message) showToast(message);
                }}
              />
              <button
                type="button"
                onClick={() => handleDelete(editingEvent)}
                className="text-xs font-medium text-text-faint transition-colors hover:text-negative"
              >
                Delete event
              </button>
            </div>
          ) : (
            <AddCalendarEventForm
              defaultDate={modal.mode === "add" ? modal.date : undefined}
              onCreated={(title) => {
                setModal(null);
                showToast(`${title} added`);
              }}
              onCancel={() => setModal(null)}
            />
          )}
        </CalendarEventModal>
      )}
    </div>
  );
}

// Same thin modal-wrapper shape every domain builds for itself (see
// goals-card.tsx's GoalModal) — a bottom sheet on mobile, a centered dialog
// from sm+.
function CalendarEventModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [closing, setClosing] = useState(false);

  function close() {
    setClosing(true);
    setTimeout(onClose, 120);
  }

  return createPortal(
    <div
      className={`fixed inset-0 z-[100] flex items-end justify-center bg-black/40 sm:items-center sm:p-4 ${
        closing ? "animate-modal-backdrop-out" : "animate-modal-backdrop"
      }`}
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-border bg-surface shadow-modal sm:rounded-xl ${
          closing ? "animate-modal-panel-out" : "animate-modal-panel"
        }`}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="truncate text-lg font-semibold text-text">{title}</h2>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="-mr-1.5 flex size-9 shrink-0 items-center justify-center rounded-lg text-text-faint transition-colors hover:bg-bg hover:text-text"
          >
            ✕
          </button>
        </div>
        <div className="p-5 sm:pb-5" style={{ paddingBottom: "var(--safe-bottom)" }}>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
