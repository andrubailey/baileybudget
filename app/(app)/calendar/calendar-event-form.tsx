"use client";

import { useState } from "react";
import { DatePicker } from "@/app/(app)/date-picker";
import { ToggleSwitch } from "@/app/(app)/toggle-switch";
import { SubmitButton } from "@/app/(app)/submit-button";
import { useToast } from "@/app/(app)/toast";
import { FIELD_CLASS as fieldClass } from "@/lib/ui";
import { weekdayName } from "@/lib/calendar";
import { createCalendarEvent, updateCalendarEvent } from "./actions";
import { AssigneeBadge } from "./assignee-badge";
import { CALENDAR_ASSIGNEES, type CalendarAssignee, type CalendarEvent } from "@/lib/types";

// The add and edit forms for a calendar event — same shape as
// objectives-section.tsx's goal forms (a form action calling the server
// action directly, a callback to close the modal), extended with a
// controlled date + "repeats weekly" toggle since the recurrence checkbox
// needs to show which weekday it's locking in.

function RecurrenceField({
  eventDate,
  recurrence,
  onChange,
}: {
  eventDate: string;
  recurrence: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-3">
        <label className="text-sm font-medium text-text">Repeats weekly</label>
        <ToggleSwitch checked={recurrence} onChange={onChange} label="Repeats weekly" />
      </div>
      <input type="hidden" name="recurrence" value={recurrence ? "weekly" : "none"} />
      {recurrence && eventDate && (
        <p className="text-xs text-text-faint">Repeats every {weekdayName(eventDate)}.</p>
      )}
    </div>
  );
}

// A row of buttons ("Andru", "Geralyn", "Kids", "Family") instead of a
// dropdown — there are only four, and seeing every option at once (with its
// own colored initial badge) is faster to scan and tap than opening a menu.
// A hidden input carries the selection into the form's FormData, same
// pattern RecurrenceField uses for its own controlled-but-form-submitted value.
function AssigneeField({
  value,
  onChange,
}: {
  value: CalendarAssignee | null;
  onChange: (value: CalendarAssignee | null) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-text">Who&apos;s it for (optional)</label>
      <input type="hidden" name="assignee" value={value ?? ""} />
      <div className="flex flex-wrap gap-2">
        {CALENDAR_ASSIGNEES.map((a) => {
          const selected = a.value === value;
          return (
            <button
              key={a.value}
              type="button"
              onClick={() => onChange(selected ? null : a.value)}
              aria-pressed={selected}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                selected
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-border text-text-muted hover:bg-bg"
              }`}
            >
              <AssigneeBadge assignee={a.value} />
              {a.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function AddCalendarEventForm({
  defaultDate,
  onCreated,
  onCancel,
}: {
  defaultDate?: string;
  onCreated: (title: string) => void;
  onCancel: () => void;
}) {
  const [eventDate, setEventDate] = useState(defaultDate ?? "");
  const [recurrence, setRecurrence] = useState(false);
  const [assignee, setAssignee] = useState<CalendarAssignee | null>(null);
  const showToast = useToast();

  return (
    <form
      action={async (formData) => {
        const result = await createCalendarEvent(formData);
        if (!result.ok) {
          showToast(result.error ? `Couldn't save: ${result.error}` : "Couldn't save event");
          return;
        }
        onCreated(String(formData.get("title") ?? "Event"));
      }}
      className="space-y-4"
    >
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-text">Title</label>
        <input name="title" required autoFocus placeholder="Piano lesson" className={fieldClass} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="space-y-1.5 sm:col-span-1">
          <label className="text-sm font-medium text-text">Date</label>
          <DatePicker name="event_date" value={eventDate} onChange={setEventDate} required />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-text">Start time (optional)</label>
          <input type="time" name="start_time" className={fieldClass} />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-text">End time (optional)</label>
          <input type="time" name="end_time" className={fieldClass} />
        </div>
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-text">Notes</label>
        <textarea name="notes" rows={2} maxLength={500} className={fieldClass} />
      </div>
      <AssigneeField value={assignee} onChange={setAssignee} />
      <RecurrenceField eventDate={eventDate} recurrence={recurrence} onChange={setRecurrence} />
      <div className="flex gap-2">
        <SubmitButton pendingText="Adding…">Add event</SubmitButton>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-text-muted transition-colors hover:bg-bg"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function EditCalendarEventForm({
  event,
  onDone,
}: {
  event: CalendarEvent;
  onDone: (message?: string) => void;
}) {
  const [eventDate, setEventDate] = useState(event.event_date);
  const [recurrence, setRecurrence] = useState(event.recurrence === "weekly");
  const [assignee, setAssignee] = useState<CalendarAssignee | null>(event.assignee);
  const showToast = useToast();

  return (
    <form
      action={async (formData) => {
        const result = await updateCalendarEvent(event.id, formData);
        if (!result.ok) {
          showToast(result.error ? `Couldn't save: ${result.error}` : "Couldn't save event");
          return;
        }
        onDone(`${formData.get("title") ?? event.title} updated`);
      }}
      className="space-y-4"
    >
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-text">Title</label>
        <input
          name="title"
          required
          autoFocus
          defaultValue={event.title}
          className={fieldClass}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="space-y-1.5 sm:col-span-1">
          <label className="text-sm font-medium text-text">Date</label>
          <DatePicker name="event_date" value={eventDate} onChange={setEventDate} required />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-text">Start time (optional)</label>
          <input type="time" name="start_time" defaultValue={event.start_time ?? ""} className={fieldClass} />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-text">End time (optional)</label>
          <input type="time" name="end_time" defaultValue={event.end_time ?? ""} className={fieldClass} />
        </div>
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-text">Notes</label>
        <textarea name="notes" rows={2} maxLength={500} defaultValue={event.notes ?? ""} className={fieldClass} />
      </div>
      <AssigneeField value={assignee} onChange={setAssignee} />
      <RecurrenceField eventDate={eventDate} recurrence={recurrence} onChange={setRecurrence} />
      <div className="flex gap-2">
        <SubmitButton pendingText="Saving…">Save changes</SubmitButton>
        <button
          type="button"
          onClick={() => onDone()}
          className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-text-muted transition-colors hover:bg-bg"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
