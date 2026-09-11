"use client";

import { Dropdown } from "@/app/(app)/dropdown";
import { goalStatusChoices } from "@/app/(app)/dropdown-options";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { deleteObjective, restoreObjective, updateObjectiveStatus } from "@/app/actions";
import { formatDate, formatMoney } from "@/lib/format";
import { timeElapsedPct } from "@/lib/objective-progress";
import type { AccountWithBalance } from "@/lib/queries";
import { type Objective } from "@/lib/types";
import { Celebration, useCelebration } from "@/app/(app)/celebration";
import { AddObjectiveForm, EditObjectiveForm } from "@/app/(app)/objectives-section";
import { SegmentedProgress } from "@/app/(app)/segmented-progress";
import { useToast } from "@/app/(app)/toast";

// Goals, as a compact card in the Overview's right rail (the standalone
// Goals page was folded in here). Each goal is one row: name, a progress
// bar, and either its linked account's balance vs. goal or the percent of
// its date range elapsed. Click a row to edit it; "+ Add" opens the same
// form in a modal. Achieved goals collapse behind a toggle so the card
// stays short.
const STATUS_DOT: Record<string, string> = {
  "Not Started": "bg-neutral",
  "In Progress": "bg-accent",
  "On Hold": "bg-caution",
  Achieved: "bg-positive",
};

function progressFor(o: Objective, accounts: AccountWithBalance[]) {
  const linked = o.linked_account_id
    ? accounts.find((a) => a.id === o.linked_account_id)
    : undefined;
  const accountPct =
    linked && linked.goal && linked.goal > 0
      ? Math.min(100, Math.max(0, (linked.balance / linked.goal) * 100))
      : null;
  const pct =
    o.status === "Achieved" ? 100 : (accountPct ?? timeElapsedPct(o.start_date, o.end_date));
  const detail =
    accountPct !== null && linked
      ? `${formatMoney(linked.balance)} of ${formatMoney(linked.goal!)}`
      : o.end_date
        ? `Due ${formatDate(o.end_date)}`
        : null;
  return { pct, detail, linked };
}

export function GoalsCard({
  objectives,
  accounts,
}: {
  objectives: Objective[];
  accounts: AccountWithBalance[];
}) {
  const [modal, setModal] = useState<{ mode: "add" } | { mode: "edit"; id: string } | null>(null);
  const [showAchieved, setShowAchieved] = useState(false);
  const [undoGoal, setUndoGoal] = useState<{ id: string; name: string } | null>(null);
  const showToast = useToast();
  const { celebrationKey, fire } = useCelebration();

  // Open goals first, soonest due date first; undated ones after.
  const open = objectives
    .filter((o) => o.status !== "Achieved")
    .sort(
      (a, b) =>
        (a.end_date ? 0 : 1) - (b.end_date ? 0 : 1) ||
        (a.end_date ?? "").localeCompare(b.end_date ?? "") ||
        a.name.localeCompare(b.name),
    );
  const achieved = objectives.filter((o) => o.status === "Achieved");
  const editing = modal?.mode === "edit" ? objectives.find((o) => o.id === modal.id) : undefined;

  async function handleDelete(o: Objective) {
    setModal(null);
    await deleteObjective(o.id);
    showToast(`${o.name} deleted`);
    setUndoGoal({ id: o.id, name: o.name });
    setTimeout(() => {
      setUndoGoal((current) => (current?.id === o.id ? null : current));
    }, 8000);
  }

  async function handleUndoDelete() {
    if (!undoGoal) return;
    await restoreObjective(undoGoal.id);
    showToast(`${undoGoal.name} restored`);
    setUndoGoal(null);
  }

  function handleStatus(o: Objective, next: string) {
    if (next === "Achieved" && o.status !== "Achieved") fire();
    updateObjectiveStatus(o.id, next);
  }

  return (
    <div className="card">
      <Celebration celebrationKey={celebrationKey} />
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-heading text-text">Goals</p>
        <button
          type="button"
          onClick={() => setModal({ mode: "add" })}
          className="text-xs font-medium text-text-faint transition-colors hover:text-text"
        >
          + Add
        </button>
      </div>

      {undoGoal && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-accent-border bg-accent-soft px-3 py-2 text-sm">
          <span className="text-accent">Deleted &ldquo;{undoGoal.name}&rdquo;.</span>
          <button
            type="button"
            onClick={handleUndoDelete}
            className="font-semibold text-accent underline underline-offset-2 hover:text-accent-bright"
          >
            Undo
          </button>
        </div>
      )}

      {objectives.length === 0 ? (
        <button
          type="button"
          onClick={() => setModal({ mode: "add" })}
          className="w-full rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-text-muted transition-colors hover:bg-bg"
        >
          Set your first goal
        </button>
      ) : (
        <>
          {open.length === 0 && (
            <p className="py-2 text-sm text-text-muted">Every goal is achieved. Nice.</p>
          )}
          <ul className="space-y-6">
            {open.map((o, i) => (
              <GoalRow
                key={o.id}
                objective={o}
                accounts={accounts}
                index={i}
                onOpen={() => setModal({ mode: "edit", id: o.id })}
              />
            ))}
          </ul>

          {achieved.length > 0 && (
            <div className="mt-4 border-t border-border pt-3">
              <button
                type="button"
                onClick={() => setShowAchieved((v) => !v)}
                className="text-xs font-medium text-text-faint transition-colors hover:text-text"
              >
                {showAchieved ? "Hide achieved" : `${achieved.length} achieved`}
              </button>
              {showAchieved && (
                <ul className="mt-3 space-y-6">
                  {achieved.map((o, i) => (
                    <GoalRow
                      key={o.id}
                      objective={o}
                      accounts={accounts}
                      index={i}
                      onOpen={() => setModal({ mode: "edit", id: o.id })}
                    />
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}

      {modal && (
        <GoalModal
          title={editing ? editing.name : "New goal"}
          onClose={() => setModal(null)}
        >
          {editing ? (
            <div className="space-y-5">
              <div className="flex items-center justify-between gap-3">
                <label className="text-sm font-medium text-text" htmlFor="goal-status">
                  Status
                </label>
                <Dropdown
                  id="goal-status"
                  variant="compact"
                  className="w-40"
                  defaultValue={editing.status}
                  onChange={(next) => handleStatus(editing, next)}
                  options={goalStatusChoices()}
                />
              </div>
              <EditObjectiveForm
                objective={editing}
                accounts={accounts}
                onDone={(message) => {
                  setModal(null);
                  if (message) showToast(message);
                }}
              />
              <button
                type="button"
                onClick={() => handleDelete(editing)}
                className="text-xs font-medium text-text-faint transition-colors hover:text-negative"
              >
                Delete goal
              </button>
            </div>
          ) : (
            <AddObjectiveForm
              accounts={accounts}
              onCreated={(name) => {
                setModal(null);
                showToast(`${name} added`);
              }}
              onCancel={() => setModal(null)}
            />
          )}
        </GoalModal>
      )}
    </div>
  );
}

function GoalRow({
  objective: o,
  accounts,
  index,
  onOpen,
}: {
  objective: Objective;
  accounts: AccountWithBalance[];
  index: number;
  onOpen: () => void;
}) {
  const { pct, detail } = progressFor(o, accounts);
  return (
    <li style={{ animationDelay: `${index * 12}ms` }} className="animate-fade-in-up">
      <button type="button" onClick={onOpen} className="group block w-full text-left">
        <div className="flex items-start gap-2">
          <span
            className={`mt-1.5 size-1.5 shrink-0 rounded-full ${STATUS_DOT[o.status] ?? "bg-neutral"}`}
            title={o.status}
            aria-label={o.status}
          />
          <span className="min-w-0 flex-1 text-sm font-medium text-balance text-text group-hover:underline">
            {o.name}
          </span>
          {pct !== null && (
            <span className="tabular shrink-0 text-xs font-semibold text-text">
              {Math.round(pct)}%
            </span>
          )}
        </div>
        {pct !== null && <SegmentedProgress pct={pct} overBudget={false} className="mt-3.5" />}
        {detail && <p className="text-metadata tabular mt-2">{detail}</p>}
      </button>
    </li>
  );
}

function GoalModal({
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

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- close only touches state setters and onClose, which don't change while open
  }, []);

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
        className={`max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-border bg-surface shadow-modal sm:rounded-xl ${
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
        <div className="p-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
