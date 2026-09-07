"use client";

import { useState } from "react";
import {
  createObjective,
  deleteObjective,
  updateObjective,
  updateObjectiveStatus,
} from "@/app/actions";
import { OBJECTIVE_STATUSES, type Objective } from "@/lib/types";
import { formatDate, formatMoney } from "@/lib/format";
import type { AccountWithBalance } from "@/lib/queries";
import { SubmitButton } from "@/app/(app)/submit-button";
import { useToast } from "@/app/(app)/toast";

const STATUS_STYLES: Record<string, string> = {
  "Not Started": "bg-bg text-text-faint",
  "In Progress": "bg-accent-soft text-accent",
  "On Hold": "bg-[#fef0c7] text-[#93370d]",
  Achieved: "bg-[#dcfae6] text-[#0b9055]",
};

// text-base (16px) on mobile prevents iOS Safari's auto-zoom-on-focus.
const fieldClass =
  "w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-base sm:py-2 sm:text-sm text-text outline-none transition-colors focus:border-accent";

function formatRange(start: string | null, end: string | null) {
  if (!start && !end) return null;
  if (start && end) return `${formatDate(start)} – ${formatDate(end)}`;
  return formatDate((start ?? end)!);
}

// % of the way from start_date to end_date, based on today's date — a proxy
// for progress when an objective has no numeric target to track against.
function timeElapsedPct(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const startMs = new Date(`${start}T00:00:00Z`).getTime();
  const endMs = new Date(`${end}T00:00:00Z`).getTime();
  if (endMs <= startMs) return null;
  // Truncate "now" to the day — using the exact millisecond would make the
  // server-render and client-hydration values differ and trigger a
  // hydration mismatch on this client component.
  const todayIso = new Date().toISOString().slice(0, 10);
  const nowMs = new Date(`${todayIso}T00:00:00Z`).getTime();
  return Math.min(100, Math.max(0, ((nowMs - startMs) / (endMs - startMs)) * 100));
}

function AddObjectiveForm({
  accounts,
  onCreated,
}: {
  accounts: AccountWithBalance[];
  onCreated: (name: string) => void;
}) {
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
      action={async (formData) => {
        await createObjective(formData);
        onCreated(String(formData.get("name") ?? "Objective"));
        setOpen(false);
      }}
      className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-surface p-6 shadow-card sm:grid-cols-2"
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
        <textarea name="notes" rows={2} maxLength={500} className={fieldClass} />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <label className="text-sm font-medium text-text">Linked account (optional)</label>
        <select name="linked_account_id" defaultValue="" className={fieldClass}>
          <option value="">Track manually</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <p className="text-xs text-text-faint">
          When set, progress tracks that account&apos;s real balance against its goal instead of time elapsed.
        </p>
      </div>
      <div className="flex gap-2 sm:col-span-2">
        <SubmitButton pendingText="Adding…">Add objective</SubmitButton>
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

function EditObjectiveForm({
  objective,
  accounts,
  onDone,
}: {
  objective: Objective;
  accounts: AccountWithBalance[];
  onDone: (message?: string) => void;
}) {
  return (
    <form
      action={async (formData) => {
        await updateObjective(objective.id, formData);
        onDone(`${objective.name} updated`);
      }}
      className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-surface p-6 shadow-card sm:grid-cols-2"
    >
      <div className="space-y-1.5 sm:col-span-2">
        <label className="text-sm font-medium text-text">Name</label>
        <input
          name="name"
          required
          autoFocus
          defaultValue={objective.name}
          className={fieldClass}
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-text">Status</label>
        <select name="status" defaultValue={objective.status} className={fieldClass}>
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
          <input
            type="date"
            name="start_date"
            defaultValue={objective.start_date ?? ""}
            className={fieldClass}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-text">End date</label>
          <input
            type="date"
            name="end_date"
            defaultValue={objective.end_date ?? ""}
            className={fieldClass}
          />
        </div>
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <label className="text-sm font-medium text-text">Notes</label>
        <textarea
          name="notes"
          rows={2}
          maxLength={500}
          defaultValue={objective.notes ?? ""}
          className={fieldClass}
        />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <label className="text-sm font-medium text-text">Linked account (optional)</label>
        <select name="linked_account_id" defaultValue={objective.linked_account_id ?? ""} className={fieldClass}>
          <option value="">Track manually</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-2 sm:col-span-2">
        <SubmitButton pendingText="Saving…">Save changes</SubmitButton>
        <button
          type="button"
          onClick={() => onDone()}
          className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-text-muted hover:bg-bg"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function ObjectivesSection({
  objectives,
  accounts,
}: {
  objectives: Objective[];
  accounts: AccountWithBalance[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const showToast = useToast();

  async function handleDelete(o: Objective) {
    if (!window.confirm(`Delete "${o.name}"? This can't be undone.`)) return;
    await deleteObjective(o.id);
    showToast(`${o.name} deleted`);
  }

  const activeCount = objectives.filter((o) => o.status !== "Achieved").length;

  return (
    <div>
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="mb-4 flex w-full items-baseline justify-between text-left"
      >
        <h2 className="text-heading text-text">Financial objectives</h2>
        <span className="flex items-center gap-2 text-xs text-text-faint">
          {objectives.length > 0 &&
            (collapsed
              ? `${activeCount} active, ${objectives.length} total`
              : "Hide")}
          <span>{collapsed ? "▾" : "▴"}</span>
        </span>
      </button>

      {collapsed ? null : (
        <>
          <div className="mb-4">
            <AddObjectiveForm accounts={accounts} onCreated={(name) => showToast(`${name} added`)} />
          </div>

          {objectives.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border py-10 text-center">
              <p className="text-sm text-text-muted">No objectives yet.</p>
              <p className="text-xs text-text-faint">Add your first one above.</p>
            </div>
          ) : (
            <div className="divide-y divide-border rounded-xl border border-border bg-surface">
              {objectives.map((o) => {
                if (editingId === o.id) {
                  return (
                    <div key={o.id} className="p-2">
                      <EditObjectiveForm
                        objective={o}
                        accounts={accounts}
                        onDone={(message) => {
                          setEditingId(null);
                          if (message) showToast(message);
                        }}
                      />
                    </div>
                  );
                }

            const range = formatRange(o.start_date, o.end_date);
            const linkedAccount = o.linked_account_id
              ? accounts.find((a) => a.id === o.linked_account_id)
              : undefined;
            const accountPct =
              linkedAccount && linkedAccount.goal && linkedAccount.goal > 0
                ? Math.min(100, Math.max(0, (linkedAccount.balance / linkedAccount.goal) * 100))
                : null;
            const pct =
              o.status === "Achieved"
                ? 100
                : accountPct !== null
                  ? accountPct
                  : timeElapsedPct(o.start_date, o.end_date);
            return (
              <div key={o.id} className="flex items-start justify-between gap-4 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-text">{o.name}</span>
                    {linkedAccount && (
                      <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] font-semibold text-text-faint">
                        {linkedAccount.name}
                      </span>
                    )}
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
                  {pct !== null && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-1.5 min-w-0 flex-1 rounded-full bg-bg">
                        <div
                          className="h-1.5 rounded-full"
                          style={{
                            width: `${pct}%`,
                            backgroundColor:
                              o.status === "Achieved" ? "#17b26a" : "var(--accent)",
                          }}
                        />
                      </div>
                      <span className="tabular shrink-0 text-xs text-text-faint">
                        {accountPct !== null
                          ? `${formatMoney(linkedAccount!.balance)} / ${formatMoney(linkedAccount!.goal!)}`
                          : `${Math.round(pct)}%`}
                      </span>
                    </div>
                  )}
                  {o.notes && (
                    <p className="mt-2 text-sm text-text-muted">{o.notes}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setEditingId(o.id)}
                    className="text-xs text-text-faint hover:text-accent"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(o)}
                    className="text-xs text-text-faint hover:text-[#f04438]"
                  >
                    Delete
                  </button>
                </div>
              </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
