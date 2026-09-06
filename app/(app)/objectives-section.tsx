"use client";

import { useState } from "react";
import {
  createObjective,
  deleteObjective,
  updateObjectiveStatus,
} from "@/app/actions";
import { OBJECTIVE_STATUSES, type Objective } from "@/lib/types";

const STATUS_STYLES: Record<string, string> = {
  "Not Started": "bg-bg text-text-faint",
  "In Progress": "bg-accent-soft text-accent",
  "On Hold": "bg-[#fef0c7] text-[#93370d]",
  Achieved: "bg-[#dcfae6] text-[#0b9055]",
};

const fieldClass =
  "w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition-colors focus:border-accent";

function formatRange(start: string | null, end: string | null) {
  if (!start && !end) return null;
  if (start && end) return `${start} – ${end}`;
  return start ?? end;
}

function AddObjectiveForm() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-text-muted transition-colors hover:bg-bg"
      >
        + Add objective
      </button>
    );
  }

  return (
    <form
      action={(formData) => {
        createObjective(formData);
        setOpen(false);
      }}
      className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-surface p-6 shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] sm:grid-cols-2"
    >
      <div className="space-y-1.5 sm:col-span-2">
        <label className="text-sm font-medium text-text">Name</label>
        <input
          name="name"
          required
          autoFocus
          placeholder="Pay off car loan"
          className={fieldClass}
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-text">Status</label>
        <select name="status" defaultValue="Not Started" className={fieldClass}>
          {OBJECTIVE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-text">Start date</label>
          <input type="date" name="start_date" className={fieldClass} />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-text">End date</label>
          <input type="date" name="end_date" className={fieldClass} />
        </div>
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <label className="text-sm font-medium text-text">Notes</label>
        <textarea name="notes" rows={2} className={fieldClass} />
      </div>
      <div className="flex gap-2 sm:col-span-2">
        <button
          type="submit"
          className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          Add objective
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-text-muted hover:bg-bg"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function ObjectivesSection({ objectives }: { objectives: Objective[] }) {
  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-text">Financial objectives</h2>
      </div>

      <div className="mb-4">
        <AddObjectiveForm />
      </div>

      {objectives.length === 0 ? (
        <p className="text-sm text-text-muted">No objectives yet — add your first one above.</p>
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border bg-surface">
          {objectives.map((o) => {
            const range = formatRange(o.start_date, o.end_date);
            return (
              <div key={o.id} className="flex items-start justify-between gap-4 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-text">{o.name}</span>
                    <select
                      defaultValue={o.status}
                      onChange={(e) => updateObjectiveStatus(o.id, e.target.value)}
                      className={`rounded-full border-0 px-2 py-0.5 text-[11px] font-medium outline-none ${STATUS_STYLES[o.status] ?? "bg-bg text-text-faint"}`}
                    >
                      {OBJECTIVE_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  {range && (
                    <p className="mt-1 text-xs text-text-faint">{range}</p>
                  )}
                  {o.notes && (
                    <p className="mt-2 text-sm text-text-muted">{o.notes}</p>
                  )}
                </div>
                <form action={deleteObjective.bind(null, o.id)}>
                  <button
                    type="submit"
                    className="text-xs text-text-faint hover:text-[#f04438]"
                  >
                    Delete
                  </button>
                </form>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
