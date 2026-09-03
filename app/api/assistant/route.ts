import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { TAG_OPTIONS } from "@/lib/types";

const MODEL = "claude-opus-5";

const LOG_TRANSACTION_TOOL: Anthropic.Tool = {
  name: "log_transaction",
  description:
    "Log an income or expense transaction into the household budget. Call this once you know the kind, description, amount, and date. If the amount or whether it's income vs. expense is genuinely ambiguous, ask a clarifying question in plain text instead of guessing.",
  input_schema: {
    type: "object",
    properties: {
      kind: { type: "string", enum: ["income", "expense"] },
      description: {
        type: "string",
        description: "Short description, e.g. the merchant or income source",
      },
      amount: { type: "number", description: "Positive dollar amount" },
      txn_date: {
        type: "string",
        description:
          "ISO date YYYY-MM-DD. Resolve relative dates like 'yesterday' or 'last Friday' using today's date given in the system prompt.",
      },
      account_name: {
        type: "string",
        description: "Name of the account this affects, if mentioned or obvious from context",
      },
      category_name: {
        type: "string",
        description: "Category name, if mentioned or obvious from context",
      },
      tags: {
        type: "array",
        items: { type: "string", enum: [...TAG_OPTIONS] },
      },
    },
    required: ["kind", "description", "amount", "txn_date"],
  },
};

function findByName<T extends { name: string }>(
  list: T[],
  name: string | undefined,
): T | null {
  if (!name) return null;
  const lower = name.trim().toLowerCase();
  return (
    list.find((x) => x.name.toLowerCase() === lower) ??
    list.find((x) => x.name.toLowerCase().includes(lower)) ??
    null
  );
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured on the server." },
      { status: 500 },
    );
  }

  const body = await request.json();
  const userMessage = String(body.message ?? "").trim();
  const state: Anthropic.MessageParam[] = Array.isArray(body.state)
    ? body.state
    : [];

  if (!userMessage) {
    return NextResponse.json({ error: "Empty message" }, { status: 400 });
  }

  const [{ data: accounts }, { data: categories }, { data: periods }] =
    await Promise.all([
      supabase
        .from("accounts")
        .select("id, name")
        .eq("is_active", true),
      supabase.from("categories").select("id, name, kind"),
      supabase.from("periods").select("id, name, start_date, end_date"),
    ]);

  const accountList = accounts ?? [];
  const categoryList = categories ?? [];
  const periodList = periods ?? [];

  const today = new Date().toISOString().slice(0, 10);

  const system = `You are a budgeting assistant embedded in a household budget app. Your only job is logging income/expense transactions via the log_transaction tool — you cannot do anything else (no editing accounts, categories, or past transactions).

Today's date is ${today}.

Known accounts: ${accountList.map((a) => a.name).join(", ") || "(none yet)"}
Known expense categories: ${categoryList.filter((c) => c.kind === "expense").map((c) => c.name).join(", ") || "(none yet)"}
Known income categories: ${categoryList.filter((c) => c.kind === "income").map((c) => c.name).join(", ") || "(none yet)"}
Available tags: ${TAG_OPTIONS.join(", ")}

When the user describes a transaction, call log_transaction with your best interpretation. Match account_name/category_name to the known lists above when possible — small wording differences are fine, they'll be matched loosely. If a field is truly unclear (e.g. no amount given), ask instead of guessing. After logging, confirm briefly in plain language (one short sentence).`;

  const messages: Anthropic.MessageParam[] = [
    ...state,
    { role: "user", content: userMessage },
  ];

  const client = new Anthropic({ apiKey });
  let loggedCount = 0;

  for (let i = 0; i < 4; i++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      output_config: { effort: "low" },
      system,
      tools: [LOG_TRANSACTION_TOOL],
      messages,
    });

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason !== "tool_use") {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return NextResponse.json({
        reply: text || "Done.",
        state: messages,
        loggedCount,
      });
    }

    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of toolUseBlocks) {
      if (block.name !== "log_transaction") {
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: "Unknown tool.",
          is_error: true,
        });
        continue;
      }

      const input = block.input as {
        kind: "income" | "expense";
        description: string;
        amount: number;
        txn_date: string;
        account_name?: string;
        category_name?: string;
        tags?: string[];
      };

      const period = periodList.find(
        (p) => p.start_date <= input.txn_date && p.end_date >= input.txn_date,
      );

      if (!period) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: `No period covers ${input.txn_date}. Tell the user to create that month on the Periods page first.`,
          is_error: true,
        });
        continue;
      }

      const account = findByName(accountList, input.account_name);
      const category = findByName(
        categoryList.filter((c) => c.kind === input.kind),
        input.category_name,
      );

      const { error } = await supabase.from("transactions").insert({
        kind: input.kind,
        description: input.description,
        amount: input.amount,
        txn_date: input.txn_date,
        account_id: account?.id ?? null,
        category_id: category?.id ?? null,
        period_id: period.id,
        tags: input.tags ?? [],
        created_by: user.id,
      });

      if (error) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: `Failed to save: ${error.message}`,
          is_error: true,
        });
        continue;
      }

      loggedCount++;
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: `Logged. Account matched: ${account?.name ?? "none"}. Category matched: ${category?.name ?? "none"}. Period: ${period.name}.`,
      });
    }

    messages.push({ role: "user", content: toolResults });
  }

  return NextResponse.json({
    reply: "That took more steps than expected — let's try again with a simpler message.",
    state: messages,
    loggedCount,
  });
}
