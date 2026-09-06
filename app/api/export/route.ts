import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Dumps every table as JSON so this data is never locked into one hosted
// database — a personal project shouldn't be the single point of failure
// for your own financial history. Optional ?category=, ?start=, ?end=
// narrow the transactions to just what's needed instead of always dumping
// everything.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const categoryId = searchParams.get("category");
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  const filtered = Boolean(categoryId || start || end);

  const [accounts, periods, categories, budgetLines, transactions, objectives] =
    await Promise.all([
      supabase.from("accounts").select("*"),
      supabase.from("periods").select("*"),
      supabase.from("categories").select("*"),
      supabase.from("budget_lines").select("*"),
      (() => {
        let query = supabase.from("transactions").select("*").is("deleted_at", null);
        if (categoryId) query = query.eq("category_id", categoryId);
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

  const payload = filtered
    ? {
        exported_at: new Date().toISOString(),
        filters: { category: categoryId, start, end },
        transactions: transactions.data,
      }
    : {
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
      "Content-Disposition": `attachment; filename="household-budget-export-${
        new Date().toISOString().slice(0, 10)
      }.json"`,
    },
  });
}
