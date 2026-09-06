"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  findPossibleDuplicateTransactions,
  getRecurringPriceHistory,
  getTransactionHistory,
  suggestCategoryForDescription,
} from "@/lib/queries";
import { cleanMerchantDescription } from "@/lib/merchant-name";

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
  const account_type = String(formData.get("account_type") ?? "").trim() || null;

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
    .insert({ name, starting_balance, goal, bank, sort_order, account_type });
  revalidatePath("/accounts");
  revalidatePath("/");
}

export async function updateAccountType(id: string, account_type: string | null) {
  const supabase = await createClient();
  await supabase.from("accounts").update({ account_type }).eq("id", id);
  revalidatePath("/accounts");
  revalidatePath("/");
}

export async function updateAccountLoginUrl(id: string, login_url: string | null) {
  const supabase = await createClient();
  await supabase.from("accounts").update({ login_url }).eq("id", id);
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

export async function updateAccountIsDebt(id: string, is_debt: boolean) {
  const supabase = await createClient();
  await supabase.from("accounts").update({ is_debt }).eq("id", id);
  revalidatePath("/accounts");
  revalidatePath("/");
}

export async function updateAccountLowBalanceAlert(
  id: string,
  low_balance_alert: number | null,
) {
  const supabase = await createClient();
  await supabase.from("accounts").update({ low_balance_alert }).eq("id", id);
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
  const rollover = formData.get("rollover") === "on";
  const group_name = String(formData.get("group_name") ?? "").trim() || null;

  if (!name) return;

  await supabase.from("categories").insert({ name, kind, is_need, rollover, group_name });
  revalidatePath("/categories");
}

export async function updateCategoryRollover(id: string, rollover: boolean) {
  const supabase = await createClient();
  await supabase.from("categories").update({ rollover }).eq("id", id);
  revalidatePath("/categories");
  revalidatePath("/");
}

export async function updateCategoryGroup(id: string, group_name: string | null) {
  const supabase = await createClient();
  await supabase.from("categories").update({ group_name }).eq("id", id);
  revalidatePath("/categories");
  revalidatePath("/planning");
  revalidatePath("/");
}

export async function updateCategoryIcon(id: string, icon: string | null) {
  const supabase = await createClient();
  await supabase.from("categories").update({ icon }).eq("id", id);
  revalidatePath("/categories");
  revalidatePath("/planning");
  revalidatePath("/");
}

export async function updateCategoryName(id: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) return;
  const supabase = await createClient();
  await supabase.from("categories").update({ name: trimmed }).eq("id", id);
  revalidatePath("/categories");
  revalidatePath("/planning");
  revalidatePath("/");
}

export async function updateCategoryNeed(id: string, is_need: boolean) {
  const supabase = await createClient();
  await supabase.from("categories").update({ is_need }).eq("id", id);
  revalidatePath("/categories");
  revalidatePath("/");
}

// budget_lines cascade-delete with the category; transactions that referenced
// it just fall back to category_id: null instead of being removed.
export async function deleteCategory(id: string) {
  const supabase = await createClient();
  await supabase.from("categories").delete().eq("id", id);
  revalidatePath("/categories");
  revalidatePath("/planning");
  revalidatePath("/");
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

export async function suggestCategory(description: string): Promise<string | null> {
  return suggestCategoryForDescription(description);
}

export async function checkDuplicateTransaction(
  account_id: string,
  amount: number,
  txn_date: string,
  excludeId?: string,
) {
  return findPossibleDuplicateTransactions(account_id, amount, txn_date, excludeId);
}

export type CsvImportRow = {
  description: string;
  amount: number;
  txn_date: string;
  account_id: string;
  category_id: string | null;
};

export type CsvImportResult = { imported: number; skippedNoPeriod: number };

// Bulk-inserts transactions parsed from a bank CSV export. Each row's
// txn_date must fall within an existing period (periods aren't
// auto-created for arbitrary historical months), so rows outside any
// known period are counted as skipped rather than silently dropped.
export async function bulkImportTransactions(
  rows: CsvImportRow[],
): Promise<CsvImportResult> {
  const supabase = await createClient();

  const [{ data: periods }, { data: { user } }] = await Promise.all([
    supabase.from("periods").select("id, start_date, end_date"),
    supabase.auth.getUser(),
  ]);

  const periodFor = (date: string) =>
    (periods ?? []).find((p) => p.start_date <= date && p.end_date >= date)?.id ?? null;

  let skippedNoPeriod = 0;
  const toInsert = [];
  for (const row of rows) {
    const period_id = periodFor(row.txn_date);
    if (!period_id) {
      skippedNoPeriod += 1;
      continue;
    }
    toInsert.push({
      kind: row.amount < 0 ? ("expense" as const) : ("income" as const),
      description: cleanMerchantDescription(row.description),
      amount: Math.abs(row.amount),
      txn_date: row.txn_date,
      account_id: row.account_id,
      category_id: row.category_id,
      period_id,
      created_by: user?.id ?? null,
      created_by_email: user?.email ?? null,
    });
  }

  if (toInsert.length > 0) {
    await supabase.from("transactions").insert(toInsert);
  }

  revalidatePath("/transactions");
  revalidatePath("/accounts");
  revalidatePath("/");

  return { imported: toInsert.length, skippedNoPeriod };
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
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!description || !amount || !txn_date) return;

  const [{ data: before }, { data: { user } }] = await Promise.all([
    supabase.from("transactions").select("*").eq("id", id).single(),
    supabase.auth.getUser(),
  ]);

  // Snapshot the pre-edit state so two people sharing this data can see what
  // changed and who changed it, instead of an edit silently overwriting the
  // other person's version with no trace.
  if (before) {
    await supabase.from("transaction_history").insert({
      transaction_id: id,
      edited_by_email: user?.email ?? null,
      snapshot: before,
    });
  }

  await supabase
    .from("transactions")
    .update({
      kind,
      description,
      amount,
      txn_date,
      account_id,
      category_id,
      notes,
    })
    .eq("id", id);

  revalidatePath("/transactions");
  revalidatePath("/");
}

export async function getHistoryForTransaction(transactionId: string) {
  return getTransactionHistory(transactionId);
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
  const linked_account_id = String(formData.get("linked_account_id") ?? "") || null;

  if (!name) return;

  await supabase
    .from("objectives")
    .insert({ name, status, start_date, end_date, notes, linked_account_id });
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
  const linked_account_id = String(formData.get("linked_account_id") ?? "") || null;

  if (!name) return;

  await supabase
    .from("objectives")
    .update({ name, status, start_date, end_date, notes, linked_account_id })
    .eq("id", id);
  revalidatePath("/");
}

export async function updateObjectiveLinkedAccount(id: string, linked_account_id: string | null) {
  const supabase = await createClient();
  await supabase.from("objectives").update({ linked_account_id }).eq("id", id);
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

// One-off cleanup: attributes every existing transaction to whoever is
// currently signed in, regardless of who originally logged it.
export async function reassignAllTransactionsToMe() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("transactions")
    .update({ created_by: user.id, created_by_email: user.email ?? null })
    .not("id", "is", null);

  revalidatePath("/transactions");
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

export async function createRecurringTransaction(formData: FormData) {
  const supabase = await createClient();
  const kind = String(formData.get("kind") ?? "expense") as "income" | "expense";
  const description = String(formData.get("description") ?? "").trim();
  const amount = Number(formData.get("amount") ?? 0);
  const account_id = String(formData.get("account_id") ?? "") || null;
  const category_id = String(formData.get("category_id") ?? "") || null;
  const day_of_month = Number(formData.get("day_of_month") ?? 1);

  if (!description || !amount || day_of_month < 1 || day_of_month > 28) return;

  await supabase.from("recurring_transactions").insert({
    kind,
    description,
    amount,
    account_id,
    category_id,
    day_of_month,
  });
  revalidatePath("/recurring");
}

export async function toggleRecurringActive(id: string, is_active: boolean) {
  const supabase = await createClient();
  await supabase.from("recurring_transactions").update({ is_active }).eq("id", id);
  revalidatePath("/recurring");
}

export async function deleteRecurringTransaction(id: string) {
  const supabase = await createClient();
  await supabase.from("recurring_transactions").delete().eq("id", id);
  revalidatePath("/recurring");
}

export async function getPriceHistoryForRecurring(id: string) {
  return getRecurringPriceHistory(id);
}

// Creates one transaction per active recurring entry for the given period,
// dated on its day_of_month within that period's month. Skips entries that
// already have a transaction generated for this period (tracked via
// recurring_transaction_id) so re-running never double-creates.
export async function generateRecurringForPeriod(periodId: string) {
  const supabase = await createClient();

  const [{ data: period }, { data: recurring }, { data: existing }, { data: { user } }] =
    await Promise.all([
      supabase.from("periods").select("*").eq("id", periodId).single(),
      supabase.from("recurring_transactions").select("*").eq("is_active", true),
      supabase
        .from("transactions")
        .select("recurring_transaction_id")
        .eq("period_id", periodId)
        .not("recurring_transaction_id", "is", null),
      supabase.auth.getUser(),
    ]);

  if (!period || !recurring || recurring.length === 0) return;

  const alreadyGenerated = new Set((existing ?? []).map((t) => t.recurring_transaction_id));
  const periodStart = new Date(period.start_date + "T00:00:00");
  const year = periodStart.getFullYear();
  const month = periodStart.getMonth();

  const rows = recurring
    .filter((r) => !alreadyGenerated.has(r.id))
    .map((r) => {
      const day = String(r.day_of_month).padStart(2, "0");
      const monthStr = String(month + 1).padStart(2, "0");
      return {
        kind: r.kind,
        description: r.description,
        amount: r.amount,
        txn_date: `${year}-${monthStr}-${day}`,
        account_id: r.account_id,
        category_id: r.category_id,
        period_id: periodId,
        recurring_transaction_id: r.id,
        created_by: user?.id ?? null,
        created_by_email: user?.email ?? null,
      };
    });

  if (rows.length > 0) {
    await supabase.from("transactions").insert(rows);
  }

  revalidatePath("/transactions");
  revalidatePath("/recurring");
  revalidatePath("/");
}

// Creates a parent transaction with no single category (category_id null)
// plus one transaction_splits row per category/amount pair, so its spend is
// distributed across categories in budget calculations.
export async function createSplitTransaction(
  formData: FormData,
  splits: { category_id: string; amount: number }[],
) {
  const supabase = await createClient();

  const kind = "expense" as const;
  const description = String(formData.get("description") ?? "").trim();
  const txn_date = String(formData.get("txn_date") ?? "");
  const account_id = String(formData.get("account_id") ?? "") || null;
  const period_id = String(formData.get("period_id") ?? "");
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const validSplits = splits.filter((s) => s.category_id && s.amount > 0);
  const amount = validSplits.reduce((sum, s) => sum + s.amount, 0);

  if (!description || !txn_date || !period_id || validSplits.length < 2 || amount <= 0) return;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: transaction, error } = await supabase
    .from("transactions")
    .insert({
      kind,
      description,
      amount,
      txn_date,
      account_id,
      category_id: null,
      period_id,
      notes,
      created_by: user?.id ?? null,
      created_by_email: user?.email ?? null,
    })
    .select()
    .single();

  if (error || !transaction) return;

  await supabase.from("transaction_splits").insert(
    validSplits.map((s) => ({
      transaction_id: transaction.id,
      category_id: s.category_id,
      amount: s.amount,
    })),
  );

  revalidatePath("/transactions");
  revalidatePath("/");
}
