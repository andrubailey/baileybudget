"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function createAccount(formData: FormData) {
  const supabase = await createClient();
  const name = String(formData.get("name") ?? "").trim();
  const starting_balance = Number(formData.get("starting_balance") ?? 0);
  const goalRaw = formData.get("goal");
  const goal = goalRaw ? Number(goalRaw) : null;
  const bank = String(formData.get("bank") ?? "").trim() || null;

  if (!name) return;

  const { data: last } = await supabase
    .from("accounts")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sort_order = (last?.sort_order ?? -1) + 1;

  await supabase
    .from("accounts")
    .insert({ name, starting_balance, goal, bank, sort_order });
  revalidatePath("/accounts");
  revalidatePath("/");
}

export async function reorderAccounts(orderedIds: string[]) {
  const supabase = await createClient();
  await Promise.all(
    orderedIds.map((id, index) =>
      supabase.from("accounts").update({ sort_order: index }).eq("id", id),
    ),
  );
  revalidatePath("/accounts");
  revalidatePath("/");
}

export async function updateAccountBank(id: string, bank: string | null) {
  const supabase = await createClient();
  await supabase.from("accounts").update({ bank }).eq("id", id);
  revalidatePath("/accounts");
}

export async function updateAccountGoal(id: string, goal: number | null) {
  const supabase = await createClient();
  await supabase.from("accounts").update({ goal }).eq("id", id);
  revalidatePath("/accounts");
  revalidatePath("/");
}

export async function toggleAccountActive(id: string, is_active: boolean) {
  const supabase = await createClient();
  await supabase.from("accounts").update({ is_active }).eq("id", id);
  revalidatePath("/accounts");
  revalidatePath("/");
}

export async function createCategory(formData: FormData) {
  const supabase = await createClient();
  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "expense") as
    | "income"
    | "expense";
  const is_need = formData.get("is_need") === "on";

  if (!name) return;

  await supabase.from("categories").insert({ name, kind, is_need });
  revalidatePath("/categories");
}

export async function upsertBudgetLine(
  category_id: string,
  period_id: string,
  planned_amount: number,
) {
  const supabase = await createClient();
  await supabase
    .from("budget_lines")
    .upsert(
      { category_id, period_id, planned_amount },
      { onConflict: "category_id,period_id" },
    );
  revalidatePath("/categories");
  revalidatePath("/");
}

export async function createTransaction(formData: FormData) {
  const supabase = await createClient();

  const kind = String(formData.get("kind") ?? "expense") as
    | "income"
    | "expense";
  const description = String(formData.get("description") ?? "").trim();
  const amount = Number(formData.get("amount") ?? 0);
  const txn_date = String(formData.get("txn_date") ?? "");
  const account_id = String(formData.get("account_id") ?? "") || null;
  const category_id = String(formData.get("category_id") ?? "") || null;
  const period_id = String(formData.get("period_id") ?? "");
  const tags = formData.getAll("tags").map(String);
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!description || !amount || !txn_date || !period_id) return;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase.from("transactions").insert({
    kind,
    description,
    amount,
    txn_date,
    account_id,
    category_id,
    period_id,
    tags,
    notes,
    created_by: user?.id ?? null,
    created_by_email: user?.email ?? null,
  });

  revalidatePath("/transactions");
  revalidatePath("/");
}

export async function updateTransaction(id: string, formData: FormData) {
  const supabase = await createClient();

  const kind = String(formData.get("kind") ?? "expense") as
    | "income"
    | "expense";
  const description = String(formData.get("description") ?? "").trim();
  const amount = Number(formData.get("amount") ?? 0);
  const txn_date = String(formData.get("txn_date") ?? "");
  const account_id = String(formData.get("account_id") ?? "") || null;
  const category_id = String(formData.get("category_id") ?? "") || null;
  const tags = formData.getAll("tags").map(String);
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!description || !amount || !txn_date) return;

  await supabase
    .from("transactions")
    .update({
      kind,
      description,
      amount,
      txn_date,
      account_id,
      category_id,
      tags,
      notes,
    })
    .eq("id", id);

  revalidatePath("/transactions");
  revalidatePath("/");
}

export async function toggleTransactionCleared(id: string, cleared: boolean) {
  const supabase = await createClient();
  await supabase.from("transactions").update({ cleared }).eq("id", id);
  revalidatePath("/transactions");
  revalidatePath("/accounts");
}

export async function createTransfer(formData: FormData) {
  const supabase = await createClient();

  const description = String(formData.get("description") ?? "").trim() || "Transfer";
  const amount = Number(formData.get("amount") ?? 0);
  const txn_date = String(formData.get("txn_date") ?? "");
  const from_account_id = String(formData.get("from_account_id") ?? "") || null;
  const to_account_id = String(formData.get("to_account_id") ?? "") || null;
  const period_id = String(formData.get("period_id") ?? "");

  if (
    !amount ||
    !txn_date ||
    !period_id ||
    !from_account_id ||
    !to_account_id ||
    from_account_id === to_account_id
  ) {
    return;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase.from("transactions").insert({
    kind: "transfer",
    description,
    amount,
    txn_date,
    account_id: from_account_id,
    to_account_id,
    category_id: null,
    period_id,
    tags: [],
    created_by: user?.id ?? null,
    created_by_email: user?.email ?? null,
  });

  revalidatePath("/transactions");
  revalidatePath("/accounts");
  revalidatePath("/");
}

export async function createObjective(formData: FormData) {
  const supabase = await createClient();
  const name = String(formData.get("name") ?? "").trim();
  const status = String(formData.get("status") ?? "Not Started");
  const start_date = String(formData.get("start_date") ?? "") || null;
  const end_date = String(formData.get("end_date") ?? "") || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!name) return;

  await supabase
    .from("objectives")
    .insert({ name, status, start_date, end_date, notes });
  revalidatePath("/");
}

export async function updateObjectiveStatus(id: string, status: string) {
  const supabase = await createClient();
  await supabase.from("objectives").update({ status }).eq("id", id);
  revalidatePath("/");
}

export async function updateObjective(id: string, formData: FormData) {
  const supabase = await createClient();
  const name = String(formData.get("name") ?? "").trim();
  const status = String(formData.get("status") ?? "Not Started");
  const start_date = String(formData.get("start_date") ?? "") || null;
  const end_date = String(formData.get("end_date") ?? "") || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!name) return;

  await supabase
    .from("objectives")
    .update({ name, status, start_date, end_date, notes })
    .eq("id", id);
  revalidatePath("/");
}

export async function deleteObjective(id: string) {
  const supabase = await createClient();
  await supabase.from("objectives").delete().eq("id", id);
  revalidatePath("/");
}

// Soft delete so a stray tap can be undone — hard-deleted nowhere, just
// filtered out of every query via `deleted_at is null`.
export async function deleteTransaction(id: string) {
  const supabase = await createClient();
  await supabase
    .from("transactions")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  revalidatePath("/transactions");
  revalidatePath("/accounts");
  revalidatePath("/");
}

export async function restoreTransaction(id: string) {
  const supabase = await createClient();
  await supabase.from("transactions").update({ deleted_at: null }).eq("id", id);
  revalidatePath("/transactions");
  revalidatePath("/accounts");
  revalidatePath("/");
}

// Copies every planned amount from one period's budget onto another,
// skipping categories that already have a planned amount set in the target
// period so it never clobbers edits you've already made there.
export async function copyBudgetForward(
  fromPeriodId: string,
  toPeriodId: string,
) {
  const supabase = await createClient();

  const [{ data: fromLines }, { data: existingLines }] = await Promise.all([
    supabase
      .from("budget_lines")
      .select("category_id, planned_amount")
      .eq("period_id", fromPeriodId),
    supabase
      .from("budget_lines")
      .select("category_id")
      .eq("period_id", toPeriodId),
  ]);

  const alreadySet = new Set((existingLines ?? []).map((l) => l.category_id));
  const rows = (fromLines ?? [])
    .filter((l) => !alreadySet.has(l.category_id))
    .map((l) => ({
      category_id: l.category_id,
      period_id: toPeriodId,
      planned_amount: l.planned_amount,
    }));

  if (rows.length > 0) {
    await supabase.from("budget_lines").insert(rows);
  }

  revalidatePath("/categories");
  revalidatePath("/");
}
