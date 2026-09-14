import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function csvCell(value: unknown): string {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Any filter narrows this from "back up everything" to "give me this
// ledger" — a shape someone actually wants to open in a spreadsheet, not
// read as JSON. Matches the Transactions page's own filter vocabulary
// (transactions-table.tsx) so "Export this filter" always maps 1:1 onto
// what's on screen.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const categoryId = searchParams.get("category");
  const accountId = searchParams.get("account");
  const kind = searchParams.get("kind");
  const flag = searchParams.get("flag");
  const q = searchParams.get("q");
  const amountMin = searchParams.get("amount_min");
  const amountMax = searchParams.get("amount_max");
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  const filtered = Boolean(
    categoryId || accountId || kind || flag || q || amountMin || amountMax || start || end,
  );

  const [accounts, periods, categories, budgetLines, transactions, objectives] =
    await Promise.all([
      supabase.from("accounts").select("*"),
      supabase.from("periods").select("*"),
      supabase.from("categories").select("*"),
      supabase.from("budget_lines").select("*"),
      (() => {
        let query = supabase.from("transactions").select("*").is("deleted_at", null);
        if (categoryId) query = query.eq("category_id", categoryId);
        if (accountId) query = query.or(`account_id.eq.${accountId},to_account_id.eq.${accountId}`);
        if (kind) query = query.eq("kind", kind);
        if (flag === "pending") query = query.eq("pending_approval", true);
        if (flag === "uncategorized") query = query.is("category_id", null).neq("kind", "transfer");
        if (q) {
          // Strip characters significant to PostgREST's .or() syntax, same
          // guard searchTransactions (lib/queries.ts) uses for the same reason.
          const safe = q.replace(/[,()]/g, " ").trim();
          if (safe) query = query.or(`description.ilike.%${safe}%,notes.ilike.%${safe}%`);
        }
        if (amountMin) query = query.gte("amount", Number(amountMin));
        if (amountMax) query = query.lte("amount", Number(amountMax));
        if (start) query = query.gte("txn_date", start);
        if (end) query = query.lte("txn_date", end);
        return query;
      })(),
      supabase.from("objectives").select("*"),
    ]);

  const firstError = [
    accounts,
    periods,
    categories,
    budgetLines,
    transactions,
    objectives,
  ].find((r) => r.error)?.error;
  if (firstError) {
    return NextResponse.json({ error: firstError.message }, { status: 500 });
  }

  const today = new Date().toISOString().slice(0, 10);

  if (filtered) {
    const accountsById = new Map((accounts.data ?? []).map((a) => [a.id, a.name]));
    const categoriesById = new Map((categories.data ?? []).map((c) => [c.id, c.name]));
    const rows = transactions.data ?? [];
    const header = ["Date", "Kind", "Description", "Amount", "Account", "To Account", "Category", "Notes"];
    const lines = [header, ...rows.map((t) => [
      t.txn_date,
      t.kind,
      t.description,
      t.amount,
      t.account_id ? (accountsById.get(t.account_id) ?? "") : "",
      t.to_account_id ? (accountsById.get(t.to_account_id) ?? "") : "",
      t.category_id ? (categoriesById.get(t.category_id) ?? "") : "",
      t.notes ?? "",
    ])];
    const csv = lines.map((row) => row.map(csvCell).join(",")).join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="transactions-export-${today}.csv"`,
      },
    });
  }

  const payload = {
    exported_at: new Date().toISOString(),
    accounts: accounts.data,
    periods: periods.data,
    categories: categories.data,
    budget_lines: budgetLines.data,
    transactions: transactions.data,
    objectives: objectives.data,
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="household-budget-export-${today}.json"`,
    },
  });
}
