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
import { EmptyState } from "@/app/(app)/empty-state";
import { Celebration, useCelebration } from "@/app/(app)/celebration";
import { FIELD_CLASS as fieldClass } from "@/lib/ui";
import { timeElapsedPct } from "@/lib/objective-progress";
import { GoalsTimeline } from "@/app/(app)/goals/goals-timeline";

const STATUS_STYLES: Record<string, string> = {
  "Not Started": "bg-bg text-text-faint",
  "In Progress": "bg-accent-soft text-accent",
  "On Hold": "bg-caution-bg text-caution-strong",
  Achieved: "bg-positive-bg text-positive-strong",
};

function formatRange(start: string | null, end: string | null) {
  if (!start && !end) return null;
  if (start && end) return `${formatDate(start)} – ${formatDate(end)}`;
  return formatDate((start ?? end)!);
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
        + Add Goal
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
        <textarea
          name="notes"
          rows={2}
          maxLength={500}
          className={fieldClass}
        />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <label className="text-sm font-medium text-text">
          Linked account (optional)
        </label>
        <select name="linked_account_id" defaultValue="" className={fieldClass}>
          <option value="">Track manually</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <p className="text-xs text-text-faint">
          When set, progress tracks that account&apos;s real balance against its
          goal instead of time elapsed.
        </p>
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <label className="text-sm font-medium text-text">
          Image URL (optional)
        </label>
        <input
          type="url"
          name="image_url"
          placeholder="https://…"
          className={fieldClass}
        />
        <p className="text-xs text-text-faint">
          Used as the background when this goal is featured on the dashboard.
        </p>
      </div>
      <div className="flex gap-2 sm:col-span-2">
        <SubmitButton pendingText="Adding…">Add Goal</SubmitButton>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-text-muted transition-colors hover:bg-bg"
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
        <select
          name="status"
          defaultValue={objective.status}
          className={fieldClass}
        >
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
        <label className="text-sm font-medium text-text">
          Linked account (optional)
        </label>
        <select
          name="linked_account_id"
          defaultValue={objective.linked_account_id ?? ""}
          className={fieldClass}
        >
          <option value="">Track manually</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <label className="text-sm font-medium text-text">
          Image URL (optional)
        </label>
        <input
          type="url"
          name="image_url"
          defaultValue={objective.image_url ?? ""}
          placeholder="https://…"
          className={fieldClass}
        />
        <p className="text-xs text-text-faint">
          Used as the background when this goal is featured on the dashboard.
        </p>
      </div>
      <div className="flex gap-2 sm:col-span-2">
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

export function ObjectivesSection({
  objectives,
  accounts,
}: {
  objectives: Objective[];
  accounts: AccountWithBalance[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [view, setView] = useState<"timeline" | "list">("list");
  const showToast = useToast();
  const { celebrationKey, fire } = useCelebration();

  async function handleDelete(o: Objective) {
    if (!window.confirm(`Delete "${o.name}"? This can't be undone.`)) return;
    await deleteObjective(o.id);
    showToast(`${o.name} deleted`);
  }

  return (
    <div>
      <Celebration celebrationKey={celebrationKey} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <AddObjectiveForm
          accounts={accounts}
          onCreated={(name) => showToast(`${name} added`)}
        />
        <div className="flex items-center rounded-lg border border-border p-0.5 text-sm font-medium">
          <button
            type="button"
            onClick={() => setView("timeline")}
            className={`rounded-md px-3 py-1.5 transition-colors ${
              view === "timeline"
                ? "bg-bg text-text"
                : "text-text-faint hover:text-text"
            }`}
          >
            Timeline
          </button>
          <button
            type="button"
            onClick={() => setView("list")}
            className={`rounded-md px-3 py-1.5 transition-colors ${
              view === "list" ? "bg-bg text-text" : "text-text-faint hover:text-text"
            }`}
          >
            List
          </button>
        </div>
      </div>

      {objectives.length === 0 ? (
        <EmptyState
          message="No objectives yet."
          action={
            <p className="text-xs text-text-faint">Add your first one above.</p>
          }
        />
      ) : view === "timeline" ? (
        <GoalsTimeline
          objectives={objectives}
          onSelect={(id) => {
            setView("list");
            setEditingId(id);
          }}
        />
      ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {objectives.map((o, i) => {
                if (editingId === o.id) {
                  return (
                    <div key={o.id} className="sm:col-span-2 lg:col-span-3">
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
                    ? Math.min(
                        100,
                        Math.max(
                          0,
                          (linkedAccount.balance / linkedAccount.goal) * 100,
                        ),
                      )
                    : null;
                const pct =
                  o.status === "Achieved"
                    ? 100
                    : accountPct !== null
                      ? accountPct
                      : timeElapsedPct(o.start_date, o.end_date);
                return (
                  <div
                    key={o.id}
                    style={{ animationDelay: `${i * 45}ms` }}
                    className="card-hover animate-fade-in-up flex flex-col rounded-xl border border-border bg-surface p-5 shadow-card"
                  >
                    <div className="flex items-start gap-3">
                      {o.image_url && (
                        // eslint-disable-next-line @next/next/no-img-element -- arbitrary user-supplied URL, not a local/known-domain asset
                        <img
                          src={o.image_url}
                          alt=""
                          className="size-10 shrink-0 rounded-lg object-cover"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-text">{o.name}</span>
                          {linkedAccount && (
                            <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] font-semibold text-text-faint">
                              {linkedAccount.name}
                            </span>
                          )}
                        </div>
                        {range && (
                          <p className="mt-1 text-xs text-text-faint">{range}</p>
                        )}
                      </div>
                    </div>

                    <select
                      defaultValue={o.status}
                      onChange={(e) => {
                        const next = e.target.value;
                        if (next === "Achieved" && o.status !== "Achieved") fire();
                        updateObjectiveStatus(o.id, next);
                      }}
                      className={`mt-3 self-start rounded-full border-0 px-2 py-0.5 text-[11px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-accent-bright focus-visible:ring-offset-1 ${STATUS_STYLES[o.status] ?? "bg-bg text-text-faint"}`}
                    >
                      {OBJECTIVE_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>

                    {pct !== null && (
                      <div className="mt-3 flex items-center gap-2">
                        <div className="h-1.5 min-w-0 flex-1 rounded-full bg-bg">
                          <div
                            className={`animate-bar-grow-x h-1.5 rounded-full ${pct >= 100 ? "animate-pulse-glow" : ""}`}
                            style={{
                              width: `${pct}%`,
                              backgroundColor:
                                o.status === "Achieved"
                                  ? "var(--positive)"
                                  : "var(--accent)",
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
                      <p className="mt-3 text-sm text-text-muted">{o.notes}</p>
                    )}

                    <div className="mt-auto flex items-center gap-3 pt-4">
                      <button
                        type="button"
                        onClick={() => setEditingId(o.id)}
                        className="text-xs text-text-faint transition-colors hover:text-accent"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(o)}
                        className="text-xs text-text-faint transition-colors hover:text-negative"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
        </div>
      )}
    </div>
  );
}
