import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { cleanMerchantDescription } from "@/lib/merchant-name";
import {
  getAccountsWithBalances,
  getCategoryProgressForRange,
  getMonthlyTotals,
  getPeriodSummaryForRange,
  searchTransactions,
} from "@/lib/queries";

const MODEL = "claude-opus-5";
// If Opus 5 declines a request, the API reruns the same request on Opus 4.8
// inside this call instead of just stopping.
const FALLBACK_BETA = "server-side-fallback-2026-06-01";
const FALLBACK_MODEL = "claude-opus-4-8";
// Room for a lookup or two, a batch of logs, and the final answer.
const MAX_STEPS = 8;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const LOG_TRANSACTION_TOOL: Anthropic.Beta.BetaTool = {
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

// Read-only lookups so the advisor answers from the household's real data
// instead of guessing. None of these can change anything.
const READ_TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "get_account_balances",
    description:
      "Current balance of every active account, with whether it's a debt account (balance = money owed) and whether it's business or personal. Use for net worth, cash on hand, or 'how much is in X'.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_spending_summary",
    description:
      "Income, expense, and net totals for a date range, plus each expense category's budget (planned) vs. actual spend in that range. Use for 'how much did I spend on X', 'am I over budget', and category questions. For a calendar month, pass its first and last day.",
    input_schema: {
      type: "object",
      properties: {
        start_date: { type: "string", description: "Inclusive start, YYYY-MM-DD." },
        end_date: { type: "string", description: "Inclusive end, YYYY-MM-DD." },
      },
      required: ["start_date", "end_date"],
    },
  },
  {
    name: "get_monthly_totals",
    description:
      "Income and expense totals for every calendar month in a date range, including months with no activity. Use for trends and month-over-month comparisons.",
    input_schema: {
      type: "object",
      properties: {
        start_date: { type: "string", description: "Inclusive start, YYYY-MM-DD." },
        end_date: { type: "string", description: "Inclusive end, YYYY-MM-DD." },
      },
      required: ["start_date", "end_date"],
    },
  },
  {
    name: "search_transactions",
    description:
      "Find individual transactions by merchant/description, notes, category name, account name, or exact amount. Returns up to 20 of the most recent matches.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Text or amount to search for, e.g. 'Publix' or '64.20'.",
        },
      },
      required: ["query"],
    },
  },
];

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

function readRange(input: Record<string, unknown>): { start: string; end: string } | null {
  const start = input.start_date;
  const end = input.end_date;
  if (typeof start !== "string" || typeof end !== "string") return null;
  if (!ISO_DATE.test(start) || !ISO_DATE.test(end) || start > end) return null;
  return { start, end };
}

const BAD_RANGE = "start_date and end_date must both be YYYY-MM-DD, with start_date on or before end_date.";

// Returns null for a tool name that isn't one of the read tools.
async function runReadTool(
  name: string,
  input: Record<string, unknown>,
): Promise<{ content: string; isError?: boolean } | null> {
  switch (name) {
    case "get_account_balances": {
      const accounts = await getAccountsWithBalances();
      return {
        content: JSON.stringify(
          accounts
            .filter((a) => a.is_active)
            .map((a) => ({
              name: a.name,
              balance: a.balance,
              is_debt: a.is_debt,
              is_business: a.is_business,
              account_type: a.account_type,
            })),
        ),
      };
    }
    case "get_spending_summary": {
      const range = readRange(input);
      if (!range) return { content: BAD_RANGE, isError: true };
      const [totals, categories] = await Promise.all([
        getPeriodSummaryForRange(range.start, range.end),
        getCategoryProgressForRange(range.start, range.end),
      ]);
      return {
        content: JSON.stringify({
          range,
          totals,
          categories: categories
            .filter((c) => c.planned !== 0 || c.actual !== 0)
            .map((c) => ({
              name: c.name,
              planned: c.planned,
              actual: c.actual,
              remaining: c.remaining,
              over_budget: c.overBudget,
            })),
        }),
      };
    }
    case "get_monthly_totals": {
      const range = readRange(input);
      if (!range) return { content: BAD_RANGE, isError: true };
      return { content: JSON.stringify(await getMonthlyTotals(range.start, range.end)) };
    }
    case "search_transactions": {
      const query = typeof input.query === "string" ? input.query : "";
      const results = await searchTransactions(query);
      return {
        content: JSON.stringify(
          results.map((t) => ({
            date: t.txn_date,
            kind: t.kind,
            description: t.description,
            amount: t.amount,
            category: t.category_name,
            account: t.account_name,
            to_account: t.to_account_name,
            notes: t.notes,
          })),
        ),
      };
    }
    default:
      return null;
  }
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
  const state: Anthropic.Beta.BetaMessageParam[] = Array.isArray(body.state)
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

  const system = `You are the AI financial advisor inside a household budget app shared by a couple. You do two things:

1. Answer questions about their finances — spending, budgets, balances, net worth, trends — using the read tools (get_account_balances, get_spending_summary, get_monthly_totals, search_transactions). Always look numbers up; never estimate or invent figures. If the data doesn't cover what they asked, say so.
2. Log income, expenses, and transfers they describe, using log_transaction.

Today's date is ${today}. "This month" means the first of this month through today; "last month" is the full previous calendar month.

Known accounts: ${accountList.map((a) => a.name).join(", ") || "(none yet)"}
Known expense categories: ${categoryList.filter((c) => c.kind === "expense").map((c) => c.name).join(", ") || "(none yet)"}
Known income categories: ${categoryList.filter((c) => c.kind === "income").map((c) => c.name).join(", ") || "(none yet)"}

Logging: they often paste or dictate a whole batch at once — several expenses, a paycheck, and a transfer in one message, sometimes as a list. Parse the entire message and call log_transaction once per transaction, in the order mentioned. For a transfer, set account_name to where the money leaves and to_account_name to where it lands, and never set category_name. Match account and category names to the known lists above — small wording differences are fine. If a field is truly unclear for one item (e.g. no amount), ask about just that one and still log everything else that was clear. After logging, confirm briefly; for more than one, use a short list.

Answering: lead with the direct answer and the key number, then only the detail that matters. When an answer has several parts, use short "## " headings and "- " bullet lists, and **bold** the key figure sparingly. Keep it concise. For general money guidance beyond their own data, be practical and mention you're not a licensed financial advisor. You can't edit or delete existing transactions, accounts, categories, or budgets — point them to the right page in the app instead.`;

  const messages: Anthropic.Beta.BetaMessageParam[] = [
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

  for (let i = 0; i < MAX_STEPS; i++) {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: [FALLBACK_BETA],
      fallbacks: [{ model: FALLBACK_MODEL }],
      output_config: { effort: "medium" },
      system,
      tools: [LOG_TRANSACTION_TOOL, ...READ_TOOLS],
      messages,
    });

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "refusal") {
      return NextResponse.json({
        reply:
          "I can't help with that one. Try asking about your spending, budget, or balances, or tell me something to log.",
        state: messages,
        loggedCount,
      });
    }

    if (response.stop_reason !== "tool_use") {
      const text = response.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
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
      (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use",
    );

    const toolResults: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const block of toolUseBlocks) {
      if (block.name !== "log_transaction") {
        try {
          const read = await runReadTool(block.name, block.input as Record<string, unknown>);
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: read?.content ?? "Unknown tool.",
            is_error: read ? read.isError : true,
          });
        } catch (err) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: `Lookup failed: ${err instanceof Error ? err.message : "unknown error"}`,
            is_error: true,
          });
        }
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
    reply: "That took more steps than expected — try asking again a little more specifically.",
    state: messages,
    loggedCount,
  });
}
