"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { generateToken, hashToken } from "@/lib/tokens";
import {
  findPossibleDuplicateTransactions,
  generateRecurringForPeriod as generateRecurringForPeriodQuery,
  getAccountsWithBalances,
  getCategories,
  getTransactionHistory,
  searchTransactions as searchTransactionsQuery,
  suggestCategoryForDescription,
  type TransactionSearchResult,
} from "@/lib/queries";
import { getPeriods, pickPeriod } from "@/lib/periods";
import { cleanMerchantDescription } from "@/lib/merchant-name";

// Data the mobile floating quick-add buttons need, fetched client-side on
// mount since (unlike the dashboard) they aren't already sitting in a
// server component's props.
export async function getQuickAddContext() {
  // periods and accounts/categories don't depend on each other — this ran
  // sequentially before (periods, then accounts+categories), which meant
  // every open of the New Transaction modal paid for two round-trips back
  // to back instead of one.
  const [periods, accounts, categories] = await Promise.all([
    getPeriods(),
    getAccountsWithBalances(),
    getCategories(),
  ]);
  const period = pickPeriod(periods);
  return {
    periodId: period?.id ?? null,
    accounts: accounts.filter((a) => a.is_active),
    categories,
  };
}

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
  const is_business = formData.get("is_business") === "on";

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
    .insert({ name, starting_balance, goal, bank, sort_order, account_type, is_business });
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

// Single combined save for the account edit modal — one round trip instead
// of firing the 7 individual field updaters above in parallel, which would
// mean 7 separate requests (each with its own revalidatePath) for one Save
// click.
export async function updateAccountDetails(
  id: string,
  data: {
    name: string;
    goal: number | null;
    bank: string | null;
    account_type: string | null;
    login_url: string | null;
    low_balance_alert: number | null;
    is_debt: boolean;
    is_active: boolean;
    is_business: boolean;
  },
) {
  const supabase = await createClient();
  await supabase
    .from("accounts")
    .update({
      name: data.name,
      goal: data.goal,
      bank: data.bank,
      account_type: data.account_type,
      login_url: data.login_url,
      low_balance_alert: data.low_balance_alert,
      is_debt: data.is_debt,
      is_active: data.is_active,
      is_business: data.is_business,
    })
    .eq("id", id);
  revalidatePath("/accounts");
  revalidatePath("/");
}

// Backs the file-picker on an account card — uploads straight to the
// "account-logos" storage bucket (public, any signed-in user can write —
// see supabase/020_account_logo.sql) and saves the resulting public URL
// immediately, the same immediate-save pattern as uploadAvatar.
export async function uploadAccountLogo(
  accountId: string,
  formData: FormData,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const file = formData.get("logo_file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "No file selected." };
  }
  if (!file.type.startsWith("image/")) {
    return { ok: false, error: "Please choose an image file." };
  }
  if (file.size > 5 * 1024 * 1024) {
    return { ok: false, error: "Image must be under 5MB." };
  }

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${accountId}/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("account-logos")
    .upload(path, file, { contentType: file.type, upsert: true });
  if (uploadError) {
    return { ok: false, error: uploadError.message };
  }

  const { data } = supabase.storage.from("account-logos").getPublicUrl(path);
  const logo_url = data.publicUrl;

  const { error } = await supabase.from("accounts").update({ logo_url }).eq("id", accountId);
  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/accounts");
  revalidatePath("/");
  return { ok: true, url: logo_url };
}

export async function removeAccountLogo(accountId: string) {
  const supabase = await createClient();
  await supabase.from("accounts").update({ logo_url: null }).eq("id", accountId);
  revalidatePath("/accounts");
  revalidatePath("/");
}

// Backs the "+ New category" quick-add affordance in the transaction
// modal/forms — a name and a kind is all it needs, no separate management
// page required just to add one.
export async function quickCreateCategory(
  name: string,
  kind: "income" | "expense",
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Name is required." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .insert({ name: trimmed, kind })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Couldn't create category." };
  }

  revalidatePath("/transactions");
  revalidatePath("/budgets");
  return { ok: true, id: data.id };
}

export async function upsertBudgetLine(
  category_id: string,
  period_id: string,
  planned_amount: number,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("budget_lines")
    .upsert(
      { category_id, period_id, planned_amount },
      { onConflict: "category_id,period_id" },
    );
  if (error) {
    return { ok: false, error: error.message };
  }
  revalidatePath("/transactions");
  revalidatePath("/budgets");
  revalidatePath("/");
  return { ok: true };
}

// Clears a single month's planned amount entirely — distinct from saving an
// explicit $0, which is still "set" as far as copyBudgetForward's
// don't-clobber check is concerned. Deleting the row means that month goes
// back to genuinely unbudgeted.
export async function deleteBudgetLine(
  category_id: string,
  period_id: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("budget_lines")
    .delete()
    .eq("category_id", category_id)
    .eq("period_id", period_id);
  if (error) {
    return { ok: false, error: error.message };
  }
  revalidatePath("/transactions");
  revalidatePath("/budgets");
  revalidatePath("/");
  return { ok: true };
}

// Deactivating (rather than deleting) a category keeps its past
// transactions and planned amounts intact — it just drops out of the
// Budgets page's default view until reactivated.
export async function updateCategoryActive(
  id: string,
  is_active: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("categories")
    .update({ is_active })
    .eq("id", id);
  if (error) {
    return { ok: false, error: error.message };
  }
  revalidatePath("/transactions");
  revalidatePath("/budgets");
  revalidatePath("/");
  return { ok: true };
}

// Manual override for the keyword-guessed icon in lib/category-icons.ts —
// `icon` null clears the override back to auto-guessing.
export async function updateCategoryIcon(
  categoryId: string,
  icon: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("categories")
    .update({ icon })
    .eq("id", categoryId);
  if (error) {
    return { ok: false, error: error.message };
  }
  revalidatePath("/budgets");
  revalidatePath("/transactions");
  revalidatePath("/");
  return { ok: true };
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

export async function searchTransactions(query: string): Promise<TransactionSearchResult[]> {
  return searchTransactionsQuery(query);
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

// Shared by createTransaction's "Make this recurring" checkbox and
// createRecurringFromTransaction (the detail modal's one-click version) —
// day_of_month is derived from the transaction's own date rather than asked
// for separately, since the whole point is "automatically set it up."
async function insertRecurringRule(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rule: {
    kind: "income" | "expense";
    description: string;
    amount: number;
    account_id: string | null;
    category_id: string | null;
    txn_date: string;
  },
) {
  const day_of_month = Math.min(28, new Date(`${rule.txn_date}T00:00:00Z`).getUTCDate());
  return supabase.from("recurring_transactions").insert({
    kind: rule.kind,
    description: rule.description,
    amount: rule.amount,
    account_id: rule.account_id,
    category_id: rule.category_id,
    day_of_month,
  });
}

export async function createTransaction(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
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
  const pending_approval = formData.get("pending_approval") === "on";
  const make_recurring = formData.get("make_recurring") === "on";

  if (!description || !amount || !txn_date || !period_id) {
    return { ok: false, error: "Missing required fields." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("transactions").insert({
    kind,
    description,
    amount,
    txn_date,
    account_id,
    category_id,
    period_id,
    notes,
    pending_approval,
    created_by: user?.id ?? null,
    created_by_email: user?.email ?? null,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  if (make_recurring) {
    // Best-effort — the transaction itself already saved successfully, so a
    // hiccup setting up the recurring rule shouldn't be reported as the
    // whole save having failed.
    const { error: recurringError } = await insertRecurringRule(supabase, {
      kind,
      description,
      amount,
      account_id,
      category_id,
      txn_date,
    });
    if (recurringError) {
      console.error("Failed to auto-create recurring rule:", recurringError);
    }
  }

  revalidatePath("/transactions");
  revalidatePath("/");
  return { ok: true };
}

export async function toggleTransactionPendingApproval(id: string, pending_approval: boolean) {
  const supabase = await createClient();
  await supabase.from("transactions").update({ pending_approval }).eq("id", id);
  revalidatePath("/transactions");
  revalidatePath("/");
}

// The detail modal's one-click "Make recurring" — sets up a recurring rule
// matching an already-logged transaction, so turning a past entry into a
// standing bill doesn't mean retyping its details into a separate form.
export async function createRecurringFromTransaction(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: t, error: fetchError } = await supabase
    .from("transactions")
    .select("kind, description, amount, account_id, category_id, txn_date")
    .eq("id", id)
    .single();
  if (fetchError || !t) {
    return { ok: false, error: fetchError?.message ?? "Transaction not found." };
  }
  if (t.kind === "transfer") {
    return { ok: false, error: "Transfers can't be made recurring." };
  }

  const { error } = await insertRecurringRule(supabase, {
    kind: t.kind as "income" | "expense",
    description: t.description,
    amount: t.amount,
    account_id: t.account_id,
    category_id: t.category_id,
    txn_date: t.txn_date,
  });
  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/transactions");
  return { ok: true };
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
  const { error } = await supabase.from("transactions").update({ cleared }).eq("id", id);
  // The client optimistically flips the checkbox before this resolves, then
  // reverts on a thrown error — silently swallowing a failed write here would
  // leave that optimistic state stuck showing the wrong value.
  if (error) throw error;
  revalidatePath("/transactions");
  revalidatePath("/accounts");
}

export async function createTransfer(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();

  const amount = Number(formData.get("amount") ?? 0);
  const txn_date = String(formData.get("txn_date") ?? "");
  const from_account_id = String(formData.get("from_account_id") ?? "") || null;
  const to_account_id = String(formData.get("to_account_id") ?? "") || null;
  const period_id = String(formData.get("period_id") ?? "");
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (
    !amount ||
    !txn_date ||
    !period_id ||
    !from_account_id ||
    !to_account_id ||
    from_account_id === to_account_id
  ) {
    return { ok: false, error: "Missing required fields." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Description is always derived from the two accounts rather than typed —
  // "From Checking to Savings" says everything a transfer's description
  // needs to, and generating it server-side (instead of trusting whatever
  // account names the client sent) keeps it accurate even if the names
  // change later.
  const { data: transferAccounts } = await supabase
    .from("accounts")
    .select("id, name")
    .in("id", [from_account_id, to_account_id]);
  const fromName =
    transferAccounts?.find((a) => a.id === from_account_id)?.name ?? "account";
  const toName = transferAccounts?.find((a) => a.id === to_account_id)?.name ?? "account";
  const description = `From ${fromName} to ${toName}`;

  const { error } = await supabase.from("transactions").insert({
    kind: "transfer",
    description,
    amount,
    txn_date,
    account_id: from_account_id,
    to_account_id,
    category_id: null,
    period_id,
    notes,
    created_by: user?.id ?? null,
    created_by_email: user?.email ?? null,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/transactions");
  revalidatePath("/accounts");
  revalidatePath("/");
  return { ok: true };
}

export async function createObjective(formData: FormData) {
  const supabase = await createClient();
  const name = String(formData.get("name") ?? "").trim();
  const status = String(formData.get("status") ?? "Not Started");
  const start_date = String(formData.get("start_date") ?? "") || null;
  const end_date = String(formData.get("end_date") ?? "") || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const linked_account_id = String(formData.get("linked_account_id") ?? "") || null;
  const image_url = String(formData.get("image_url") ?? "").trim() || null;

  if (!name) return;

  await supabase
    .from("objectives")
    .insert({ name, status, start_date, end_date, notes, linked_account_id, image_url });
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
  const image_url = String(formData.get("image_url") ?? "").trim() || null;

  if (!name) return;

  await supabase
    .from("objectives")
    .update({ name, status, start_date, end_date, notes, linked_account_id, image_url })
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

// Bulk versions of delete/update for the transactions table's row-selection
// toolbar — one round trip for N selected rows instead of N separate ones.
export async function bulkDeleteTransactions(
  ids: string[],
): Promise<{ ok: boolean; error?: string }> {
  if (ids.length === 0) return { ok: true };
  const supabase = await createClient();
  const { error } = await supabase
    .from("transactions")
    .update({ deleted_at: new Date().toISOString() })
    .in("id", ids);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/transactions");
  revalidatePath("/accounts");
  revalidatePath("/");
  return { ok: true };
}

export async function bulkUpdateTransactions(
  ids: string[],
  patch: { account_id?: string | null; txn_date?: string; category_id?: string | null },
): Promise<{ ok: boolean; error?: string }> {
  if (ids.length === 0) return { ok: true };
  const supabase = await createClient();
  const { error } = await supabase.from("transactions").update(patch).in("id", ids);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/transactions");
  revalidatePath("/accounts");
  revalidatePath("/");
  return { ok: true };
}

export async function restoreTransaction(id: string) {
  const supabase = await createClient();
  await supabase.from("transactions").update({ deleted_at: null }).eq("id", id);
  revalidatePath("/transactions");
  revalidatePath("/accounts");
  revalidatePath("/");
}

// Backs the "Created by" dropdown in the transaction detail modal — reassign
// attribution to whichever household member actually logged it, instead of
// only being able to "claim" it as whoever's currently signed in. Scoped to
// one transaction at a time, same as before.
export async function updateTransactionCreator(
  id: string,
  created_by: string | null,
  created_by_email: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { error } = await supabase
    .from("transactions")
    .update({ created_by, created_by_email })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/transactions");
  revalidatePath("/");
  return { ok: true };
}

// Copies every planned amount from one period's budget onto another,
// skipping categories that already have a planned amount set in the target
// period so it never clobbers edits you've already made there.
export async function copyBudgetForward(
  fromPeriodId: string,
  toPeriodId: string,
): Promise<{ ok: boolean; copied?: number; error?: string }> {
  const supabase = await createClient();

  const [
    { data: fromLines, error: fromError },
    { data: existingLines, error: existingError },
  ] = await Promise.all([
    supabase
      .from("budget_lines")
      .select("category_id, planned_amount")
      .eq("period_id", fromPeriodId),
    supabase
      .from("budget_lines")
      .select("category_id")
      .eq("period_id", toPeriodId),
  ]);
  if (fromError) return { ok: false, error: fromError.message };
  if (existingError) return { ok: false, error: existingError.message };

  const alreadySet = new Set((existingLines ?? []).map((l) => l.category_id));
  const rows = (fromLines ?? [])
    .filter((l) => !alreadySet.has(l.category_id))
    .map((l) => ({
      category_id: l.category_id,
      period_id: toPeriodId,
      planned_amount: l.planned_amount,
    }));

  if (rows.length > 0) {
    const { error } = await supabase.from("budget_lines").insert(rows);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/transactions");
  revalidatePath("/budgets");
  revalidatePath("/");
  return { ok: true, copied: rows.length };
}

// Used from the transaction detail modal to stop a recurring bill that was
// set up via the "Make this recurring" checkbox (or the one-click "Make
// recurring" on an existing transaction) — paused rather than deleted, so
// generateRecurringForPeriod simply stops picking it up going forward.
export async function toggleRecurringActive(id: string, is_active: boolean) {
  const supabase = await createClient();
  await supabase.from("recurring_transactions").update({ is_active }).eq("id", id);
  revalidatePath("/transactions");
}

// Server Action wrapper around the plain query version (which the
// Transactions page also calls directly during its own render, where
// revalidatePath isn't allowed) — kept for any explicit manual trigger.
export async function generateRecurringForPeriod(periodId: string) {
  await generateRecurringForPeriodQuery(periodId);
  revalidatePath("/transactions");
  revalidatePath("/");
}

// Creates a parent transaction with no single category (category_id null)
// plus one transaction_splits row per category/amount pair, so its spend is
// distributed across categories in budget calculations.
export async function createSplitTransaction(
  formData: FormData,
  splits: { category_id: string; amount: number }[],
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();

  const kind = "expense" as const;
  const description = String(formData.get("description") ?? "").trim();
  const txn_date = String(formData.get("txn_date") ?? "");
  const account_id = String(formData.get("account_id") ?? "") || null;
  const period_id = String(formData.get("period_id") ?? "");
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const validSplits = splits.filter((s) => s.category_id && s.amount > 0);
  const amount = validSplits.reduce((sum, s) => sum + s.amount, 0);

  if (!description || !txn_date || !period_id || validSplits.length < 2 || amount <= 0) {
    return { ok: false, error: "Missing required fields." };
  }

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

  if (error || !transaction) {
    return { ok: false, error: error?.message ?? "Insert failed." };
  }

  const { error: splitsError } = await supabase.from("transaction_splits").insert(
    validSplits.map((s) => ({
      transaction_id: transaction.id,
      category_id: s.category_id,
      amount: s.amount,
    })),
  );

  if (splitsError) {
    return { ok: false, error: splitsError.message };
  }

  revalidatePath("/transactions");
  revalidatePath("/");
  return { ok: true };
}

export type ApiTokenSummary = {
  id: string;
  label: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

export async function listApiTokens(): Promise<ApiTokenSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("api_tokens")
    .select("id, label, created_at, last_used_at, revoked_at")
    .order("created_at", { ascending: false });
  // Best-effort: this table's migration is one people run manually, so a
  // household that hasn't gotten to it yet would otherwise crash the whole
  // Settings page with an unhandled throw instead of just showing no tokens.
  if (error) {
    console.error("listApiTokens failed:", error);
    return [];
  }
  return data ?? [];
}

// Returns the raw token exactly once — only its hash is stored, so this is
// the only chance to see/copy it.
export async function createApiToken(label: string): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const raw = generateToken();
  const { error } = await supabase.from("api_tokens").insert({
    token_hash: hashToken(raw),
    label: label.trim() || "Shortcuts token",
    created_by_email: user?.email ?? null,
  });
  if (error) throw error;

  revalidatePath("/settings");
  return raw;
}

export async function revokeApiToken(id: string) {
  const supabase = await createClient();
  await supabase.from("api_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/settings");
}

export async function updateMyProfile(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const display_name = String(formData.get("display_name") ?? "").trim() || null;
  const avatar_url = String(formData.get("avatar_url") ?? "").trim() || null;

  const { error } = await supabase
    .from("profiles")
    .upsert({ id: user.id, display_name, avatar_url, updated_at: new Date().toISOString() });
  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/");
  return { ok: true };
}

// Backs the file-picker in the profile modal — uploads straight to the
// "avatars" storage bucket (each user's files live under a folder named for
// their own auth.uid(), see supabase/019_avatars_bucket.sql) and saves the
// resulting public URL onto the profile immediately, rather than staging it
// behind the modal's "Save changes" button like the other profile fields.
export async function uploadAvatar(
  formData: FormData,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const file = formData.get("avatar_file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "No file selected." };
  }
  if (!file.type.startsWith("image/")) {
    return { ok: false, error: "Please choose an image file." };
  }
  if (file.size > 5 * 1024 * 1024) {
    return { ok: false, error: "Image must be under 5MB." };
  }

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${user.id}/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, file, { contentType: file.type, upsert: true });
  if (uploadError) {
    return { ok: false, error: uploadError.message };
  }

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  const avatar_url = data.publicUrl;

  const { error } = await supabase
    .from("profiles")
    .upsert({ id: user.id, avatar_url, updated_at: new Date().toISOString() });
  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/");
  return { ok: true, url: avatar_url };
}
