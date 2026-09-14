"use client";

// A transaction typed with no signal used to just vanish — the server
// action's fetch rejects, the optimistic row gets withdrawn, and there was
// nothing left telling the user their entry was ever gone, let alone a way
// to get it back. This is the recovery path: when a submit fails because
// there's no connection (not because the server rejected it), the entry is
// staged here instead of discarded, and flushed the moment the connection
// comes back — same data, no retyping.
//
// localStorage rather than IndexedDB or a service worker: the household's
// queue is realistically 0-2 items at a time, the payloads are a few
// hundred bytes of plain strings, and a service worker's background-sync
// API isn't reliable enough across iOS Safari to be the only path — this
// works the moment the tab itself is foregrounded again, which for an app
// used in short bursts is the case that actually matters.
const STORAGE_KEY = "budgetapp-offline-queue-v1";

export type QueuedKind = "transaction" | "transfer" | "split";

export type QueuedJob = {
  id: string;
  kind: QueuedKind;
  // The original optimistic row's id (see pending-transactions.ts) — once
  // this job actually lands, that ghost row needs withdrawing so the real,
  // revalidated row doesn't end up duplicated on screen next to it.
  pendingId: string;
  // A FormData's entries, flattened to plain strings — FormData itself
  // isn't JSON-serializable, and every field this app's forms submit is
  // already a plain string or a stringified number/id. A `kind: "split"`
  // job additionally carries its split rows JSON-encoded under the
  // `__splits` key, since createSplitTransaction takes those as a separate
  // argument rather than as part of the form itself.
  fields: Record<string, string>;
  label: string;
  queuedAt: string;
};

export type SplitRow = { category_id: string; amount: number };

export function encodeSplitRows(rows: SplitRow[]): string {
  return JSON.stringify(rows);
}

export function decodeSplitRows(fields: Record<string, string>): SplitRow[] {
  try {
    const parsed = JSON.parse(fields.__splits ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readQueue(): QueuedJob[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export const QUEUE_CHANGED_EVENT = "budgetapp:offline-queue-changed";

function writeQueue(jobs: QueuedJob[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
  } catch {
    // localStorage unavailable (private browsing, quota) — the job just
    // won't survive a reload; the in-memory pending row still shows it as
    // queued for the rest of this session, which is the best available.
  }
  window.dispatchEvent(new CustomEvent(QUEUE_CHANGED_EVENT));
}

export function enqueueJob(job: Omit<QueuedJob, "queuedAt">) {
  const jobs = readQueue();
  jobs.push({ ...job, queuedAt: new Date().toISOString() });
  writeQueue(jobs);
}

export function getQueue(): QueuedJob[] {
  return readQueue();
}

function removeJob(id: string) {
  writeQueue(readQueue().filter((j) => j.id !== id));
}

export function formDataToFields(formData: FormData): Record<string, string> {
  const fields: Record<string, string> = {};
  formData.forEach((value, key) => {
    fields[key] = String(value);
  });
  return fields;
}

export function fieldsToFormData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

// Runs every currently-queued job in order (oldest first) and stops at the
// first one that still fails — if the connection dropped again mid-flush,
// there's no point hammering the rest, and preserving order means a
// transfer queued after a transaction can't jump ahead of it. Returns the
// pendingIds that landed for real, so the caller can withdraw those
// optimistic rows and let the revalidated data take over.
export async function flushOfflineQueue(handlers: {
  transaction: (fields: Record<string, string>) => Promise<{ ok: boolean; error?: string }>;
  transfer: (fields: Record<string, string>) => Promise<{ ok: boolean; error?: string }>;
  split: (fields: Record<string, string>) => Promise<{ ok: boolean; error?: string }>;
}): Promise<{ landed: string[]; remaining: number }> {
  const jobs = readQueue();
  const landed: string[] = [];
  for (const job of jobs) {
    const handler =
      job.kind === "transaction" ? handlers.transaction : job.kind === "transfer" ? handlers.transfer : handlers.split;
    let result: { ok: boolean; error?: string };
    try {
      result = await handler(job.fields);
    } catch {
      // Still offline (or offline again) — leave this and everything after
      // it in the queue, in order, for the next attempt.
      break;
    }
    if (result.ok) {
      removeJob(job.id);
      landed.push(job.pendingId);
    } else {
      // The server actually rejected it (bad data, a category that no
      // longer exists) — retrying forever won't help, and leaving it queued
      // silently forever is worse than surfacing the failure once.
      removeJob(job.id);
    }
  }
  return { landed, remaining: readQueue().length };
}
