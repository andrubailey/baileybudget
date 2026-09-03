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

  await supabase
    .from("accounts")
    .insert({ name, starting_balance, goal, bank });
  revalidatePath("/accounts");
  revalidatePath("/");
}

export async function updateAccountBank(id: string, bank: string | null) {
  const supabase = await createClient();
  await supabase.from("accounts").update({ bank }).eq("id", id);
  revalidatePath("/accounts");
}

export async function toggleAccountActive(id: string, is_active: boolean) {
  const supabase = await createClient();
  await supabase.from("accounts").update({ is_active }).eq("id", id);
  revalidatePath("/accounts");
  revalidatePath("/");
}

export async function createPeriod(formData: FormData) {
  const supabase = await createClient();
  const name = String(formData.get("name") ?? "").trim();
  const start_date = String(formData.get("start_date") ?? "");
  const end_date = String(formData.get("end_date") ?? "");

  if (!name || !start_date || !end_date) return;

  await supabase.from("periods").insert({ name, start_date, end_date });
  revalidatePath("/periods");
  revalidatePath("/");
}

export async function createCategory(formData: FormData) {
  const supabase = await createClient();
  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "expense") as
    | "income"
    | "expense";
  const is_need = formData.get("is_need") === "on";
  const planned_amount = Number(formData.get("planned_amount") ?? 0);
  // Expense categories belong to the period they were created in; income
  // categories are shared across all periods.
  const period_id =
    kind === "expense" ? String(formData.get("period_id") ?? "") || null : null;

  if (!name || (kind === "expense" && !period_id)) return;

  await supabase
    .from("categories")
    .insert({ name, kind, is_need, period_id, planned_amount });
  revalidatePath("/categories");
  revalidatePath("/");
}

export async function updateCategoryPlanned(
  category_id: string,
  planned_amount: number,
) {
  const supabase = await createClient();
  await supabase
    .from("categories")
    .update({ planned_amount })
    .eq("id", category_id);
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
    created_by: user?.id ?? null,
  });

  revalidatePath("/transactions");
  revalidatePath("/");
}

export async function deleteTransaction(id: string) {
  const supabase = await createClient();
  await supabase.from("transactions").delete().eq("id", id);
  revalidatePath("/transactions");
  revalidatePath("/");
}
