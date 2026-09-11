"use server";

import { revalidateHousehold } from "@/lib/cache";
import { createClient } from "@/lib/supabase/server";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Re-anchors a loan to a newer statement: the principal and escrow it shows,
// the date those figures are as of, and when the next payment is due.
export async function updateLoanFromStatement(
  id: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const principal_balance = Number(formData.get("principal_balance"));
  const monthly_payment = Number(formData.get("monthly_payment"));
  const escrowRaw = String(formData.get("escrow_balance") ?? "").trim();
  const escrow_balance = escrowRaw ? Number(escrowRaw) : null;
  const balance_as_of = String(formData.get("balance_as_of") ?? "");
  const next_payment_due = String(formData.get("next_payment_due") ?? "");

  if (!Number.isFinite(principal_balance) || principal_balance < 0) {
    return { ok: false, error: "Enter the principal balance from the statement." };
  }
  if (!Number.isFinite(monthly_payment) || monthly_payment <= 0) {
    return { ok: false, error: "Enter the full monthly payment." };
  }
  if (escrow_balance !== null && !Number.isFinite(escrow_balance)) {
    return { ok: false, error: "Escrow balance isn't a number." };
  }
  if (!ISO_DATE.test(balance_as_of) || !ISO_DATE.test(next_payment_due)) {
    return { ok: false, error: "Pick both dates." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("loans")
    .update({ principal_balance, monthly_payment, escrow_balance, balance_as_of, next_payment_due })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidateHousehold(["loans"]);
  return { ok: true };
}
