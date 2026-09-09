import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { cleanMerchantDescription } from "@/lib/merchant-name";

const MODEL = "claude-opus-5";

const LOG_TRANSACTION_TOOL: Anthropic.Tool = {
  name: "log_transaction",
  description:
    "Log one income, expense, or transfer into the household budget. Call this once per transaction — if the user describes several in one message, call it multiple times in the same turn, once for each. If the amount or whether it's income vs. expense vs. transfer is genuinely ambiguous, ask a clarifying question in plain text instead of guessing.",
  input_schema: {
    type: "object",
    properties: {
      kind: { type: "string", enum: ["income", "expense", "transfer"] },
      description: {
        type: "string",
        description:
          "Short description, e.g. the merchant or income source. Ignored for kind='transfer' — its description is always generated as 'From X to Y' from the two accounts, so any value works there.",
      },
      amount: { type: "number", description: "Positive dollar amount" },
      txn_date: {
        type: "string",
        description:
          "ISO date YYYY-MM-DD. Resolve relative dates like 'yesterday' or 'last Friday' using today's date given in the system prompt.",
      },
      account_name: {
        type: "string",
        description:
          "Name of the account this affects, if mentioned or obvious from context. For a transfer, this is the source account money leaves.",
      },
      to_account_name: {
        type: "string",
        description:
          "Only for kind='transfer': name of the destination account money moves into.",
      },
      category_name: {
        type: "string",
        description:
          "Category name, if mentioned or obvious from context. Never set for kind='transfer' — transfers aren't categorized.",
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
  try {
    return await handlePost(request);
  } catch (err) {
    console.error("assistant route error:", err);
    const message =
      err instanceof Anthropic.APIError && err.status === 401
        ? "The server's Anthropic API key is invalid or expired — ask whoever set up this app to update ANTHROPIC_API_KEY."
        : err instanceof Error
          ? err.message
          : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function handlePost(request: Request) {
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

  const system = `You are a budgeting assistant embedded in a household budget app. Your only job is logging income, expense, and transfer transactions via the log_transaction tool — you cannot do anything else (no editing accounts, categories, or past transactions).

Today's date is ${today}.

Known accounts: ${accountList.map((a) => a.name).join(", ") || "(none yet)"}
Known expense categories: ${categoryList.filter((c) => c.kind === "expense").map((c) => c.name).join(", ") || "(none yet)"}
Known income categories: ${categoryList.filter((c) => c.kind === "income").map((c) => c.name).join(", ") || "(none yet)"}

The user often pastes or dictates a whole batch at once — several expenses, a paycheck, and a transfer all in one message, sometimes as a list. Parse the *entire* message and call log_transaction once per transaction it describes, all in the same turn, in the order mentioned. Don't stop after the first one. For a transfer, set account_name to where the money leaves and to_account_name to where it lands, and never set category_name. Match account_name/to_account_name/category_name to the known lists above when possible — small wording differences are fine, they'll be matched loosely. If a field is truly unclear for one item (e.g. no amount given), ask about just that one instead of guessing, but still log everything else that was clear. After logging, confirm briefly in plain language — if you logged more than one, summarize as a short list, not a paragraph.`;

  const messages: Anthropic.MessageParam[] = [
    ...state,
    { role: "user", content: userMessage },
  ];

  // Org-wide (not workspace-scoped) API keys require this header on every
  // request. Harmless to omit for a workspace-scoped key.
  const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID;
  const client = new Anthropic({
    apiKey,
    defaultHeaders: workspaceId ? { "anthropic-workspace-id": workspaceId } : undefined,
  });
  let loggedCount = 0;

  for (let i = 0; i < 4; i++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      output_config: { effort: "medium" },
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
        kind: "income" | "expense" | "transfer";
        description: string;
        amount: number;
        txn_date: string;
        account_name?: string;
        to_account_name?: string;
        category_name?: string;
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
      const isTransfer = input.kind === "transfer";
      const toAccount = isTransfer
        ? findByName(accountList, input.to_account_name)
        : null;
      const category = isTransfer
        ? null
        : findByName(
            categoryList.filter((c) => c.kind === input.kind),
            input.category_name,
          );

      if (isTransfer && (!account || !toAccount)) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: `Couldn't match both accounts for this transfer (from "${input.account_name ?? ""}" to "${input.to_account_name ?? ""}"). Ask the user which accounts they mean.`,
          is_error: true,
        });
        continue;
      }

      // Same rule as the manual "Add transfer" form: a transfer's
      // description is always derived from its two accounts, never typed
      // (by a person or, here, generated by the model).
      // For everything else, running it through the same cleanup CSV import
      // uses keeps merchant names consistent regardless of entry path — a
      // pasted statement line ("CHICK-FIL-A #05927") comes out the same way
      // here as it would through the importer ("Chick Fil A").
      const description = isTransfer
        ? `From ${account?.name} to ${toAccount?.name}`
        : cleanMerchantDescription(input.description);

      const { error } = await supabase.from("transactions").insert({
        kind: input.kind,
        description,
        amount: input.amount,
        txn_date: input.txn_date,
        account_id: account?.id ?? null,
        to_account_id: toAccount?.id ?? null,
        category_id: category?.id ?? null,
        period_id: period.id,
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
        content: isTransfer
          ? `Logged transfer. From: ${account?.name}. To: ${toAccount?.name}. Period: ${period.name}.`
          : `Logged. Account matched: ${account?.name ?? "none"}. Category matched: ${category?.name ?? "none"}. Period: ${period.name}.`,
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
