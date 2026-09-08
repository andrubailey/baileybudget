import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashToken } from "@/lib/tokens";

type Body = {
  kind?: string;
  description?: string;
  amount?: number | string;
  account?: string;
  to_account?: string;
  category?: string;
  txn_date?: string;
  notes?: string;
};

// Finds the period covering `date`, auto-creating the current month's
// period if none covers it yet — mirrors lib/periods.ts, duplicated here
// since that helper reads its client from cookies (a browser session),
// which a Shortcuts request never has.
async function resolvePeriodId(
  supabase: ReturnType<typeof createAdminClient>,
  date: string,
): Promise<string | null> {
  const { data: covering } = await supabase
    .from("periods")
    .select("id")
    .lte("start_date", date)
    .gte("end_date", date)
    .maybeSingle();
  if (covering) return covering.id;

  const today = new Date().toISOString().slice(0, 10);
  const { data: current } = await supabase
    .from("periods")
    .select("id")
    .lte("start_date", today)
    .gte("end_date", today)
    .maybeSingle();
  if (current) return current.id;

  const now = new Date();
  const start = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
  const end = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const name = start.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const { data: created } = await supabase
    .from("periods")
    .insert({ name, start_date: iso(start), end_date: iso(end) })
    .select("id")
    .single();
  return created?.id ?? null;
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: tokenRow } = await supabase
    .from("api_tokens")
    .select("id, revoked_at")
    .eq("token_hash", hashToken(token))
    .maybeSingle();

  if (!tokenRow || tokenRow.revoked_at) {
    return NextResponse.json({ error: "Invalid or revoked token" }, { status: 401 });
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const kind = body.kind === "income" || body.kind === "transfer" ? body.kind : "expense";
  const description = String(body.description ?? "").trim();
  const amount = Number(body.amount);
  const txn_date = body.txn_date && /^\d{4}-\d{2}-\d{2}$/.test(body.txn_date)
    ? body.txn_date
    : new Date().toISOString().slice(0, 10);

  if (!description || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "description and a positive amount are required" }, { status: 400 });
  }

  const [{ data: accounts }] = await Promise.all([supabase.from("accounts").select("id, name")]);

  const findAccount = (name: string | undefined) =>
    name ? accounts?.find((a) => a.name.toLowerCase() === name.trim().toLowerCase())?.id ?? null : null;

  const account_id = findAccount(body.account);
  if (body.account && !account_id) {
    return NextResponse.json({ error: `No account named "${body.account}"` }, { status: 400 });
  }

  const period_id = await resolvePeriodId(supabase, txn_date);
  if (!period_id) {
    return NextResponse.json({ error: "Could not resolve a budget period" }, { status: 500 });
  }

  await supabase
    .from("api_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", tokenRow.id);

  if (kind === "transfer") {
    const to_account_id = findAccount(body.to_account);
    if (!account_id || !to_account_id || account_id === to_account_id) {
      return NextResponse.json(
        { error: "Transfers need distinct account and to_account names" },
        { status: 400 },
      );
    }
    const { data: transaction, error } = await supabase
      .from("transactions")
      .insert({
        kind: "transfer",
        description: description || "Transfer",
        amount,
        txn_date,
        account_id,
        to_account_id,
        category_id: null,
        period_id,
        notes: body.notes?.trim() || null,
        created_by_email: "Shortcuts",
      })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: transaction.id });
  }

  const { data: categories } = await supabase.from("categories").select("id, name, kind").eq("kind", kind);
  const category_id = body.category
    ? categories?.find((c) => c.name.toLowerCase() === body.category!.trim().toLowerCase())?.id ?? null
    : null;
  if (body.category && !category_id) {
    return NextResponse.json({ error: `No ${kind} category named "${body.category}"` }, { status: 400 });
  }

  const { data: transaction, error } = await supabase
    .from("transactions")
    .insert({
      kind,
      description,
      amount,
      txn_date,
      account_id,
      category_id,
      period_id,
      notes: body.notes?.trim() || null,
      created_by_email: "Shortcuts",
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: transaction.id });
}
