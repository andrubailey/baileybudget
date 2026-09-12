"use server";

import { revalidateHousehold } from "@/lib/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { generateToken, hashToken } from "@/lib/tokens";
import {
  findPossibleDuplicateTransactions,
  postRecurringForPeriod,
  getAccounts,
  getAccountsWithBalances,
  getCategories,
  getTransactionHistory,
  searchTransactions as searchTransactionsQuery,
  suggestCategoryForDescription,
  type TransactionSearchResult,
} from "@/lib/queries";
import { getPeriods, pickPeriod } from "@/lib/periods";
import { cleanMerchantDescription } from "@/lib/merchant-name";
import { getCurrentSession } from "@/lib/profile";

// A transaction amount is only ever entered through the app's own
// CurrencyInput (which can't produce a minus sign) or an external caller
// (AI assistant, Shortcuts) that must be trusted the same way regardless of
// entry point. Rounding to the cent here means a stray extra decimal digit
// from any of those callers can never make a stored amount silently drift
// from the two-decimal figure every view of the app displays. Returns null
// for anything that isn't a real, present number (missing, blank, NaN) —
// callers decide how to report that; a bare 0 is a valid amount and passes
// through.
function parseAmount(raw: FormDataEntryValue | number | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

// Data the quick-add modals need, fetched client-side on demand since
// (unlike the dashboard) they aren't already sitting in a server
// component's props.
export async function getQuickAddContext() {
  // periods and accounts/categories don't depend on each other — this ran
  // sequentially before (periods, then accounts+categories), which meant
  // every open of the New Transaction modal paid for two round-trips back
  // to back instead of one. Plain getAccounts(), not getAccountsWithBalances():
  // the forms only need each account's name and is_debt flag, and the
  // balances version paginates through the household's entire transactions
  // table just to compute numbers nothing here ever displays.
  const [periods, accounts, categories] = await Promise.all([
    getPeriods(),
    getAccounts(),
    getCategories(),
  ]);
  const period = pickPeriod(periods);
  return {
    periodId: period?.id ?? null,
    periodStart: period?.start_date ?? null,
    periodEnd: period?.end_date ?? null,
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
  revalidateHousehold(["accounts"]);
}

export async function updateAccountType(id: string, account_type: string | null) {
  const supabase = await createClient();
  await supabase.from("accounts").update({ account_type }).eq("id", id);
  revalidateHousehold(["accounts"]);
}

export async function updateAccountLoginUrl(id: string, login_url: string | null) {
  const supabase = await createClient();
  await supabase.from("accounts").update({ login_url }).eq("id", id);
  revalidateHousehold(["accounts"]);
}

export async function updateAccountBank(id: string, bank: string | null) {
  const supabase = await createClient();
  await supabase.from("accounts").update({ bank }).eq("id", id);
  revalidateHousehold(["accounts"]);
}

// The mobile Accounts screen's reconcile action. Balances are never stored
// directly (always starting_balance + transaction history), so "correcting"
// one means logging the difference as a same-day adjustment transaction
// rather than overwriting a field — that way transaction history stays the
// single source of truth and the adjustment shows up in the account's own
// history like any other entry. category_id stays null (and no split rows
// get created for it), which already keeps it out of every category/budget
// total the same way an uncategorized transaction would. Always stamps
// balance_checked_at, even when the entered figure matches exactly — a
// confirmed-correct balance is worth recording too, not just a corrected one.
export async function reconcileAccountBalance(
  accountId: string,
  actualBalance: number,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();

  const [accounts, periods] = await Promise.all([getAccountsWithBalances(), getPeriods()]);
  const account = accounts.find((a) => a.id === accountId);
  if (!account) return { ok: false, error: "Account not found." };

  const period = pickPeriod(periods);
  const diff = Math.round((actualBalance - account.balance) * 100) / 100;

  if (diff !== 0) {
    if (!period) {
      return { ok: false, error: "Couldn't find a period to log the adjustment in." };
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("transactions").insert({
      kind: diff > 0 ? "income" : "expense",
      description: "Balance adjustment",
      amount: Math.abs(diff),
      txn_date: new Date().toISOString().slice(0, 10),
      account_id: accountId,
      category_id: null,
      period_id: period.id,
      created_by: user?.id ?? null,
      created_by_email: user?.email ?? null,
    });
    if (error) return { ok: false, error: error.message };
  }

  const { error: stampError } = await supabase
    .from("accounts")
    .update({ balance_checked_at: new Date().toISOString() })
    .eq("id", accountId);
  if (stampError) return { ok: false, error: stampError.message };

  revalidateHousehold(["accounts", "transactions"]);
  return { ok: true };
}

export async function updateAccountGoal(id: string, goal: number | null) {
  const supabase = await createClient();
  await supabase.from("accounts").update({ goal }).eq("id", id);
  revalidateHousehold(["accounts"]);
}

export async function toggleAccountActive(id: string, is_active: boolean) {
  const supabase = await createClient();
  await supabase.from("accounts").update({ is_active }).eq("id", id);
  revalidateHousehold(["accounts"]);
}

export async function updateAccountIsDebt(id: string, is_debt: boolean) {
  const supabase = await createClient();
  await supabase.from("accounts").update({ is_debt }).eq("id", id);
  revalidateHousehold(["accounts"]);
}

export async function updateAccountLowBalanceAlert(
  id: string,
  low_balance_alert: number | null,
) {
  const supabase = await createClient();
  await supabase.from("accounts").update({ low_balance_alert }).eq("id", id);
  revalidateHousehold(["accounts"]);
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
  revalidateHousehold(["accounts"]);
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
  // getSession() decodes the cookie locally instead of round-tripping to
  // the Auth server like getUser() does — safe here (unlike a page's own
  // auth check) because proxy.ts's middleware already ran a real,
  // network-validated check on this exact request before this action could
  // even be invoked; this is only re-confirming what middleware guaranteed.
  const user = (await getCurrentSession())?.user ?? null;
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

  revalidateHousehold(["accounts"]);
  return { ok: true, url: logo_url };
}

export async function removeAccountLogo(accountId: string) {
  const supabase = await createClient();
  await supabase.from("accounts").update({ logo_url: null }).eq("id", accountId);
  revalidateHousehold(["accounts"]);
}

// Backs the "+ New category" quick-add affordance in the transaction
// modal/forms — a name and a kind is all it needs, no separate management
// page required just to add one.
export async function quickCreateCategory(
  name: string,
  kind: "income" | "expense",
  icon?: string | null,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Name is required." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .insert({ name: trimmed, kind, icon: icon || null })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Couldn't create category." };
  }

  revalidateHousehold(["categories"]);
  return { ok: true, id: data.id };
}

export async function upsertBudgetLine(
  category_id: string,
  period_id: string,
  planned_amount: number,
): Promise<{ ok: boolean; error?: string }> {
  if (!Number.isFinite(planned_amount) || planned_amount < 0) {
    return { ok: false, error: "Enter a valid, non-negative amount." };
  }
  const roundedAmount = Math.round(planned_amount * 100) / 100;
  const supabase = await createClient();
  const { error } = await supabase
    .from("budget_lines")
    .upsert(
      { category_id, period_id, planned_amount: roundedAmount },
      { onConflict: "category_id,period_id" },
    );
  if (error) {
    return { ok: false, error: error.message };
  }
  revalidateHousehold(["budget_lines"]);
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
  revalidateHousehold(["budget_lines"]);
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
  revalidateHousehold(["categories"]);
  return { ok: true };
}

// "Need" is descriptive only for now (no needs/wants rollup reads it yet).
// "Roll over unspent" is live: lib/queries.ts's getRolloverAmounts already
// folds it into next month's planned amount whenever it's on — this is
// just the one place in the UI that can turn it on or off, which didn't
// exist before (direct database edit only).
export async function updateCategorySettings(
  id: string,
  data: { is_need: boolean; rollover: boolean },
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("categories")
    .update({ is_need: data.is_need, rollover: data.rollover })
    .eq("id", id);
  if (error) {
    return { ok: false, error: error.message };
  }
  revalidateHousehold(["categories"]);
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
  revalidateHousehold(["categories"]);
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

  // getSession() (local cookie decode) instead of getUser() (a real round
  // trip to the Auth server) — see the comment on the same swap in
  // uploadAccountLogo above.
  const [{ data: periods }, session] = await Promise.all([
    supabase.from("periods").select("id, start_date, end_date"),
    getCurrentSession(),
  ]);
  const user = session?.user ?? null;

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

  revalidateHousehold(["transactions"]);

  return { imported: toInsert.length, skippedNoPeriod };
}

// Shared by createTransaction's "Make this recurring" checkbox and
// createRecurringFromTransaction (the detail modal's one-click version) —
// day_of_month is derived from the transaction's own date rather than asked
// for separately, since the whole point is "automatically set it up."
// Returns the new rule's id so the caller can link the seed transaction
// back to it via recurring_transaction_id — without that link, the "Repeats
// monthly" toggle can never see that a rule already exists for this
// transaction, which meant re-opening it and re-toggling it on created a
// second (then a third...) identical rule, and toggling it back off had no
// rule id to actually deactivate.
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
  return supabase
    .from("recurring_transactions")
    .insert({
      kind: rule.kind,
      description: rule.description,
      amount: rule.amount,
      account_id: rule.account_id,
      category_id: rule.category_id,
      day_of_month,
    })
    .select("id")
    .single();
}

export async function createTransaction(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();

  const kind = String(formData.get("kind") ?? "expense") as
    | "income"
    | "expense";
  const description = String(formData.get("description") ?? "").trim();
  const txn_date = String(formData.get("txn_date") ?? "");
  const account_id = String(formData.get("account_id") ?? "") || null;
  const category_id = String(formData.get("category_id") ?? "") || null;
  const period_id = String(formData.get("period_id") ?? "");
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const pending_approval = formData.get("pending_approval") === "on";
  const make_recurring = formData.get("make_recurring") === "on";

  if (!description || !txn_date || !period_id) {
    return { ok: false, error: "Missing required fields." };
  }

  const amount = parseAmount(formData.get("amount"));
  if (amount === null) {
    return { ok: false, error: "Enter a valid amount." };
  }
  if (amount < 0) {
    return { ok: false, error: "Amount can't be negative." };
  }

  const user = (await getCurrentSession())?.user ?? null;

  const { data: inserted, error } = await supabase
    .from("transactions")
    .insert({
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
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return { ok: false, error: error?.message };
  }

  if (make_recurring) {
    // Best-effort — the transaction itself already saved successfully, so a
    // hiccup setting up the recurring rule shouldn't be reported as the
    // whole save having failed.
    const { data: rule, error: recurringError } = await insertRecurringRule(supabase, {
      kind,
      description,
      amount,
      account_id,
      category_id,
      txn_date,
    });
    if (recurringError || !rule) {
      console.error("Failed to auto-create recurring rule:", recurringError);
    } else {
      const { error: linkError } = await supabase
        .from("transactions")
        .update({ recurring_transaction_id: rule.id })
        .eq("id", inserted.id);
      if (linkError) {
        console.error("Failed to link recurring rule to its seed transaction:", linkError);
      }
    }
  }

  revalidateHousehold(make_recurring ? ["transactions", "recurring_transactions"] : ["transactions"]);
  return { ok: true };
}

export async function toggleTransactionPendingApproval(id: string, pending_approval: boolean) {
  const supabase = await createClient();
  await supabase.from("transactions").update({ pending_approval }).eq("id", id);
  revalidateHousehold(["transactions"]);
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

  const { data: rule, error } = await insertRecurringRule(supabase, {
    kind: t.kind as "income" | "expense",
    description: t.description,
    amount: t.amount,
    account_id: t.account_id,
    category_id: t.category_id,
    txn_date: t.txn_date,
  });
  if (error || !rule) {
    return { ok: false, error: error?.message ?? "Couldn't create recurring rule." };
  }

  const { error: linkError } = await supabase
    .from("transactions")
    .update({ recurring_transaction_id: rule.id })
    .eq("id", id);
  if (linkError) {
    console.error("Failed to link recurring rule to its seed transaction:", linkError);
  }

  revalidateHousehold(["transactions", "recurring_transactions"]);
  return { ok: true };
}

export async function updateTransaction(
  id: string,
  formData: FormData,
  // The `updated_at` the editor loaded the transaction with. When another
  // save has landed since then, `before.updated_at` (fetched fresh, below)
  // won't match — that's the only signal available that a second edit would
  // otherwise silently overwrite a first one with no warning to either
  // person, so this is treated as a hard stop rather than proceeding anyway.
  expectedUpdatedAt?: string,
): Promise<{ ok: boolean; error?: string; conflict?: boolean }> {
  const supabase = await createClient();

  const kind = String(formData.get("kind") ?? "expense") as
    | "income"
    | "expense";
  const description = String(formData.get("description") ?? "").trim();
  const txn_date = String(formData.get("txn_date") ?? "");
  const account_id = String(formData.get("account_id") ?? "") || null;
  const category_id = String(formData.get("category_id") ?? "") || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!description || !txn_date) {
    return { ok: false, error: "Missing required fields." };
  }

  const amount = parseAmount(formData.get("amount"));
  if (amount === null) {
    return { ok: false, error: "Enter a valid amount." };
  }
  if (amount < 0) {
    return { ok: false, error: "Amount can't be negative." };
  }

  const [{ data: before }, session] = await Promise.all([
    supabase.from("transactions").select("*").eq("id", id).single(),
    getCurrentSession(),
  ]);
  const user = session?.user ?? null;

  if (!before) {
    return { ok: false, error: "Transaction not found." };
  }

  if (expectedUpdatedAt && before.updated_at !== expectedUpdatedAt) {
    return {
      ok: false,
      conflict: true,
      error: "Someone else already changed this transaction. Reload to see the latest version.",
    };
  }

  // Snapshot the pre-edit state so two people sharing this data can see what
  // changed and who changed it, instead of an edit silently overwriting the
  // other person's version with no trace.
  await supabase.from("transaction_history").insert({
    transaction_id: id,
    edited_by_email: user?.email ?? null,
    snapshot: before,
  });

  const updated_at = new Date().toISOString();
  const { error } = await supabase
    .from("transactions")
    .update({
      kind,
      description,
      amount,
      txn_date,
      account_id,
      category_id,
      notes,
      updated_at,
    })
    .eq("id", id);

  if (error) {
    return { ok: false, error: error.message };
  }

  // An edit only changes these two tables — re-fetching every table (the
  // default) made each save's refresh several times slower than it needs
  // to be.
  revalidateHousehold(["transactions", "transaction_history"]);
  return { ok: true };
}

export async function getHistoryForTransaction(transactionId: string) {
  return getTransactionHistory(transactionId);
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

  const user = (await getCurrentSession())?.user ?? null;

  // Every transfer is simply "Transfer" — the row already shows which two
  // accounts it moved between, so the description doesn't repeat them.
  const description = "Transfer";

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

  revalidateHousehold(["transactions"]);
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
  revalidateHousehold(["objectives"]);
}

export async function updateObjectiveStatus(id: string, status: string) {
  const supabase = await createClient();
  await supabase.from("objectives").update({ status }).eq("id", id);
  revalidateHousehold(["objectives"]);
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
  revalidateHousehold(["objectives"]);
}

export async function updateObjectiveLinkedAccount(id: string, linked_account_id: string | null) {
  const supabase = await createClient();
  await supabase.from("objectives").update({ linked_account_id }).eq("id", id);
  revalidateHousehold(["objectives"]);
}

// Soft delete so a stray tap can be undone — same pattern as
// deleteTransaction below, filtered out of getObjectives via
// `deleted_at is null`.
export async function deleteObjective(id: string) {
  const supabase = await createClient();
  await supabase
    .from("objectives")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  revalidateHousehold(["objectives"]);
}

export async function restoreObjective(id: string) {
  const supabase = await createClient();
  await supabase.from("objectives").update({ deleted_at: null }).eq("id", id);
  revalidateHousehold(["objectives"]);
}

// Soft delete so a stray tap can be undone — hard-deleted nowhere, just
// filtered out of every query via `deleted_at is null`.
export async function deleteTransaction(id: string) {
  const supabase = await createClient();
  await supabase
    .from("transactions")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  revalidateHousehold(["transactions"]);
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
  revalidateHousehold(["transactions"]);
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
  revalidateHousehold(["transactions"]);
  return { ok: true };
}

export async function restoreTransaction(id: string) {
  const supabase = await createClient();
  await supabase.from("transactions").update({ deleted_at: null }).eq("id", id);
  revalidateHousehold(["transactions"]);
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

  revalidateHousehold(["budget_lines"]);
  return { ok: true, copied: rows.length };
}

// Used from the transaction detail modal to stop a recurring bill that was
// set up via the "Make this recurring" checkbox (or the one-click "Make
// recurring" on an existing transaction) — paused rather than deleted, so
// generateRecurringForPeriod simply stops picking it up going forward.
export async function toggleRecurringActive(id: string, is_active: boolean) {
  const supabase = await createClient();
  await supabase.from("recurring_transactions").update({ is_active }).eq("id", id);
  revalidateHousehold(["recurring_transactions"]);
}

// Server Action wrapper around the plain query version (which the
// Transactions page also calls directly during its own render, where
// revalidatePath isn't allowed) — kept for any explicit manual trigger.
export async function generateRecurringForPeriod(periodId: string) {
  const posted = await postRecurringForPeriod(periodId);
  if (posted > 0) revalidateHousehold(["transactions"]);
  return posted;
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

  const user = (await getCurrentSession())?.user ?? null;

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
    // The parent transaction row above already committed — without this,
    // a failed splits insert would leave it sitting in the table with a
    // real amount, category_id: null, and zero split rows, which renders
    // as an ordinary uncategorized transaction with no sign anything went
    // wrong. Two separate inserts can't be wrapped in one DB transaction
    // through the REST client, so this deletes the orphan for real (not a
    // soft delete — the user never got a success confirmation for it, so
    // there's nothing to "undo") instead of leaving it to be discovered
    // later as a mysteriously uncategorized expense.
    const { error: cleanupError } = await supabase
      .from("transactions")
      .delete()
      .eq("id", transaction.id);
    if (cleanupError) {
      console.error(
        `createSplitTransaction: splits insert failed AND cleanup of orphaned transaction ${transaction.id} failed — it's still in the table with no splits.`,
        cleanupError,
      );
      revalidateHousehold(["transactions"]);
      return {
        ok: false,
        error: `Couldn't save the split, and couldn't undo the partial save either (${splitsError.message}). Check Transactions for a stray "${description}" entry.`,
      };
    }
    revalidateHousehold(["transactions"]);
    return { ok: false, error: splitsError.message };
  }

  revalidateHousehold(["transactions", "transaction_splits"]);
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
  const user = (await getCurrentSession())?.user ?? null;

  const raw = generateToken();
  const { error } = await supabase.from("api_tokens").insert({
    token_hash: hashToken(raw),
    label: label.trim() || "Shortcuts token",
    created_by_email: user?.email ?? null,
  });
  if (error) throw error;

  // api_tokens isn't a cached snapshot table (nothing reads it through
  // snapshotClient()) — nothing to invalidate there, but revalidateHousehold
  // still refreshes the Settings page's own live query via revalidatePath.
  revalidateHousehold([]);
  return raw;
}

export async function revokeApiToken(id: string) {
  const supabase = await createClient();
  await supabase.from("api_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", id);
  revalidateHousehold([]);
}

export async function updateMyProfile(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const user = (await getCurrentSession())?.user ?? null;
  if (!user) return { ok: false, error: "Not signed in." };

  const display_name = String(formData.get("display_name") ?? "").trim() || null;
  const avatar_url = String(formData.get("avatar_url") ?? "").trim() || null;

  const { error } = await supabase
    .from("profiles")
    .upsert({ id: user.id, display_name, avatar_url, updated_at: new Date().toISOString() });
  if (error) {
    return { ok: false, error: error.message };
  }

  revalidateHousehold(["profiles"]);
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
  const user = (await getCurrentSession())?.user ?? null;
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

  revalidateHousehold(["profiles"]);
  return { ok: true, url: avatar_url };
}

