"use client";

import { DatePicker } from "@/app/(app)/date-picker";

import { Dropdown } from "@/app/(app)/dropdown";
import { accountChoices, goalStatusChoices } from "@/app/(app)/dropdown-options";

import { createObjective, updateObjective } from "@/app/actions";
import { type Objective } from "@/lib/types";
import type { AccountWithBalance } from "@/lib/queries";
import { SubmitButton } from "@/app/(app)/submit-button";
import { FIELD_CLASS as fieldClass } from "@/lib/ui";

// The add and edit forms for a goal, used inside the Overview's Goals card
// modal (see goals-card.tsx). The standalone Goals page that used to host
// these was folded into that card.

export function AddObjectiveForm({
  accounts,
  onCreated,
  onCancel,
}: {
  accounts: AccountWithBalance[];
  onCreated: (name: string) => void;
  onCancel: () => void;
}) {
  return (
    <form
      action={async (formData) => {
        await createObjective(formData);
        onCreated(String(formData.get("name") ?? "Objective"));
      }}
      className="grid grid-cols-1 gap-4 sm:grid-cols-2"
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
        <Dropdown
          name="status"
          defaultValue="Not Started"
          options={goalStatusChoices()}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-text">Start date</label>
          <DatePicker name="start_date" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-text">End date</label>
          <DatePicker name="end_date" />
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
        <Dropdown
          name="linked_account_id"
          defaultValue=""
          options={accountChoices(accounts, "Track manually")}
        />
        <p className="text-xs text-text-faint">
          When set, progress tracks that account&apos;s real balance against its
          goal instead of time elapsed.
        </p>
      </div>
      <div className="flex gap-2 sm:col-span-2">
        <SubmitButton pendingText="Adding…">Add Goal</SubmitButton>
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

export function EditObjectiveForm({
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
      className="grid grid-cols-1 gap-4 sm:grid-cols-2"
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
        <Dropdown
          name="status"
          defaultValue={objective.status}
          options={goalStatusChoices()}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-text">Start date</label>
          <DatePicker name="start_date" defaultValue={objective.start_date ?? ""} />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-text">End date</label>
          <DatePicker name="end_date" defaultValue={objective.end_date ?? ""} />
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
        <Dropdown
          name="linked_account_id"
          defaultValue={objective.linked_account_id ?? ""}
          options={accountChoices(accounts, "Track manually")}
        />
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
