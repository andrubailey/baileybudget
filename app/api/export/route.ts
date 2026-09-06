import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Dumps every table as JSON so this data is never locked into one hosted
// database — a personal project shouldn't be the single point of failure
// for your own financial history.
export async function GET() {
  const supabase = await createClient();

  const [accounts, periods, categories, budgetLines, transactions, objectives] =
    await Promise.all([
      supabase.from("accounts").select("*"),
      supabase.from("periods").select("*"),
      supabase.from("categories").select("*"),
      supabase.from("budget_lines").select("*"),
      supabase.from("transactions").select("*").is("deleted_at", null),
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
      "Content-Disposition": `attachment; filename="household-budget-export-${
        new Date().toISOString().slice(0, 10)
      }.json"`,
    },
  });
}
