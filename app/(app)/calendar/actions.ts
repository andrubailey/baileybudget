"use server";

import { revalidateHousehold } from "@/lib/cache";
import { createClient } from "@/lib/supabase/server";
import { CALENDAR_ASSIGNEES, type CalendarAssignee } from "@/lib/types";

type CalendarEventInput = {
  title: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  notes: string | null;
  recurrence: "none" | "weekly";
  assignee: CalendarAssignee | null;
};

const ASSIGNEE_VALUES = CALENDAR_ASSIGNEES.map((a) => a.value as string);

function readInput(formData: FormData): { ok: true; input: CalendarEventInput } | { ok: false; error: string } {
  const title = String(formData.get("title") ?? "").trim();
  const event_date = String(formData.get("event_date") ?? "");
  if (!title) return { ok: false, error: "Title is required." };
  if (!event_date) return { ok: false, error: "Date is required." };

  const start_time = String(formData.get("start_time") ?? "") || null;
  const end_time = String(formData.get("end_time") ?? "") || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const recurrence = formData.get("recurrence") === "weekly" ? "weekly" : "none";
  const rawAssignee = String(formData.get("assignee") ?? "");
  const assignee = ASSIGNEE_VALUES.includes(rawAssignee) ? (rawAssignee as CalendarAssignee) : null;

  return { ok: true, input: { title, event_date, start_time, end_time, notes, recurrence, assignee } };
}

export async function createCalendarEvent(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const parsed = readInput(formData);
  if (!parsed.ok) return parsed;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from("calendar_events").insert({
    ...parsed.input,
    created_by: user?.id ?? null,
    created_by_email: user?.email ?? null,
  });
  if (error) return { ok: false, error: error.message };

  revalidateHousehold(["calendar_events"]);
  return { ok: true };
}

export async function updateCalendarEvent(
  id: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const parsed = readInput(formData);
  if (!parsed.ok) return parsed;

  const supabase = await createClient();
  const { error } = await supabase.from("calendar_events").update(parsed.input).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidateHousehold(["calendar_events"]);
  return { ok: true };
}

// Soft delete so a stray tap can be undone — same pattern as
// deleteObjective/deleteTransaction.
export async function deleteCalendarEvent(id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("calendar_events")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidateHousehold(["calendar_events"]);
  return { ok: true };
}

export async function restoreCalendarEvent(id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("calendar_events").update({ deleted_at: null }).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidateHousehold(["calendar_events"]);
  return { ok: true };
}
