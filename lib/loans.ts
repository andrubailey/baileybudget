import { snapshotClient } from "@/lib/snapshot";
import { summarizeLoan, type Loan, type LoanSummary } from "@/lib/loan-math";

// Every loan with its balance brought forward from the statement by the
// payments logged since. Reads as empty until migration 024 has been run.
export async function getLoanSummaries(): Promise<LoanSummary[]> {
  const supabase = snapshotClient();
  const [{ data: loans }, { data: transactions }] = await Promise.all([
    supabase.from("loans").select("*").order("created_at", { ascending: true }),
    supabase.from("transactions").select("*").eq("kind", "expense").is("deleted_at", null),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  return ((loans ?? []) as Loan[]).map((loan) => summarizeLoan(loan, transactions ?? [], today));
}
