import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { revalidateHousehold } from "@/lib/cache";
import { cleanMerchantDescription } from "@/lib/merchant-name";
import {
  getAccountsWithBalances,
  getCategoryProgressForRange,
  getMonthlyTotals,
  getPeriodSummaryForRange,
  getSafeToSpend,
  searchTransactions,
  suggestCategoryForDescription,
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
          "Short description, e.g. the merchant or income source. Ignored for kind='transfer' — every transfer is saved with the description \"Transfer\", so any value works there.",
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
  {
    name: "get_safe_to_spend",
    description:
      "How much is left to freely spend this month: remaining budget across every category, minus recurring bills due later this month that haven't posted yet. Use for 'can I afford X', 'how much can I spend', or 'what's safe to spend right now' — this already accounts for upcoming bills, so don't subtract them yourself.",
    input_schema: { type: "object", properties: {} },
  },
];

// Everything that changes the household's data beyond logging a
// transaction (which has its own tool above, since it needs the most
// involved matching logic). Every delete here is reversible in the app —
// accounts/categories are deactivated rather than removed, and goals and
// transactions are soft-deleted with the same "Undo" a click in the UI
// would offer — so these run immediately rather than asking for a second
// confirmation first.
const WRITE_TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "create_goal",
    description: "Create a new savings/financial goal.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        end_date: { type: "string", description: "Optional target date, YYYY-MM-DD." },
        notes: { type: "string" },
        linked_account_name: {
          type: "string",
          description:
            "Optional: an account whose balance (vs. that account's goal amount, if set) tracks this goal's progress instead of its end date.",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "delete_goal",
    description: "Delete an existing goal by name. Reversible — same as deleting it in the app.",
    input_schema: {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
    },
  },
  {
    name: "create_account",
    description: "Create a new account (checking, savings, credit card, cash, etc.).",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        starting_balance: { type: "number", description: "Defaults to 0." },
        account_type: {
          type: "string",
          description: "Free-text type, e.g. 'Checking', 'Savings', 'Credit Card'.",
        },
        is_debt: {
          type: "boolean",
          description: "True for a credit card or loan, where balance means money owed.",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "deactivate_account",
    description:
      "Deactivate (hide) an account by name — its history is kept, it just stops showing up as active. This is what 'delete' means for an account in this app.",
    input_schema: {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
    },
  },
  {
    name: "create_category",
    description: "Create a new income or expense category.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        kind: { type: "string", enum: ["income", "expense"] },
      },
      required: ["name", "kind"],
    },
  },
  {
    name: "deactivate_category",
    description:
      "Deactivate an expense or income category by name — past transactions and budget history are kept, it just drops out of the default view. This is what 'delete' means for a category in this app.",
    input_schema: {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
    },
  },
  {
    name: "set_budget",
    description:
      "Set (or change) how much is planned/budgeted for an expense category in a given month.",
    input_schema: {
      type: "object",
      properties: {
        category_name: { type: "string" },
        month: {
          type: "string",
          description: "Any date within the target month, YYYY-MM-DD — matched to that month's period.",
        },
        planned_amount: { type: "number" },
      },
      required: ["category_name", "month", "planned_amount"],
    },
  },
  {
    name: "delete_transaction",
    description:
      "Delete one transaction by its id. Only use an id returned by search_transactions in this same conversation — never guess one. Reversible, same as deleting it in the app.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
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
  // Only get_safe_to_spend needs this — it's "this month," not a range the
  // model picks, so the current period is resolved once by the caller
  // (which already loaded every period) instead of re-querying here.
  currentPeriod: { id: string; name: string } | null,
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
            id: t.id,
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
    case "get_safe_to_spend": {
      if (!currentPeriod) {
        return {
          content: "No period covers today — tell the user to create this month on the Periods page first.",
          isError: true,
        };
      }
      const safeToSpend = await getSafeToSpend(currentPeriod.id);
      return {
        content: JSON.stringify({ period: currentPeriod.name, safe_to_spend: safeToSpend }),
      };
    }
    default:
      return null;
  }
}

type WriteToolContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  accountList: { id: string; name: string }[];
  categoryList: { id: string; name: string; kind: string }[];
  objectiveList: { id: string; name: string }[];
  periodList: { id: string; name: string; start_date: string; end_date: string }[];
};

// Returns null for a tool name that isn't one of the write tools.
async function runWriteTool(
  name: string,
  input: Record<string, unknown>,
  ctx: WriteToolContext,
): Promise<{ content: string; isError?: boolean; changed?: boolean } | null> {
  const { supabase, accountList, categoryList, objectiveList, periodList } = ctx;
  switch (name) {
    case "create_goal": {
      const goalName = typeof input.name === "string" ? input.name.trim() : "";
      if (!goalName) return { content: "A goal name is required.", isError: true };
      const linkedAccount = findByName(accountList, input.linked_account_name as string | undefined);
      const end_date =
        typeof input.end_date === "string" && ISO_DATE.test(input.end_date) ? input.end_date : null;
      const notes = typeof input.notes === "string" ? input.notes.trim() || null : null;
      const { error } = await supabase.from("objectives").insert({
        name: goalName,
        status: "Not Started",
        end_date,
        notes,
        linked_account_id: linkedAccount?.id ?? null,
      });
      if (error) return { content: `Failed to create goal: ${error.message}`, isError: true };
      return { content: `Created goal "${goalName}".`, changed: true };
    }
    case "delete_goal": {
      const goal = findByName(objectiveList, input.name as string | undefined);
      if (!goal) return { content: `No goal found matching "${input.name}".`, isError: true };
      const { error } = await supabase
        .from("objectives")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", goal.id);
      if (error) return { content: `Failed to delete goal: ${error.message}`, isError: true };
      return { content: `Deleted goal "${goal.name}".`, changed: true };
    }
    case "create_account": {
      const accountName = typeof input.name === "string" ? input.name.trim() : "";
      if (!accountName) return { content: "An account name is required.", isError: true };
      const starting_balance = typeof input.starting_balance === "number" ? input.starting_balance : 0;
      const account_type =
        typeof input.account_type === "string" ? input.account_type.trim() || null : null;
      const is_debt = input.is_debt === true;
      const { data: last } = await supabase
        .from("accounts")
        .select("sort_order")
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      const sort_order = (last?.sort_order ?? -1) + 1;
      const { error } = await supabase
        .from("accounts")
        .insert({ name: accountName, starting_balance, account_type, is_debt, sort_order });
      if (error) return { content: `Failed to create account: ${error.message}`, isError: true };
      return { content: `Created account "${accountName}".`, changed: true };
    }
    case "deactivate_account": {
      const account = findByName(accountList, input.name as string | undefined);
      if (!account) return { content: `No active account found matching "${input.name}".`, isError: true };
      const { error } = await supabase.from("accounts").update({ is_active: false }).eq("id", account.id);
      if (error) return { content: `Failed to deactivate account: ${error.message}`, isError: true };
      return { content: `Deactivated account "${account.name}".`, changed: true };
    }
    case "create_category": {
      const categoryName = typeof input.name === "string" ? input.name.trim() : "";
      const kind = input.kind === "income" ? "income" : input.kind === "expense" ? "expense" : null;
      if (!categoryName || !kind) {
        return { content: "A category name and kind (income or expense) are required.", isError: true };
      }
      const { error } = await supabase.from("categories").insert({ name: categoryName, kind });
      if (error) return { content: `Failed to create category: ${error.message}`, isError: true };
      return { content: `Created ${kind} category "${categoryName}".`, changed: true };
    }
    case "deactivate_category": {
      const category = findByName(categoryList, input.name as string | undefined);
      if (!category) return { content: `No category found matching "${input.name}".`, isError: true };
      const { error } = await supabase
        .from("categories")
        .update({ is_active: false })
        .eq("id", category.id);
      if (error) return { content: `Failed to deactivate category: ${error.message}`, isError: true };
      return { content: `Deactivated category "${category.name}".`, changed: true };
    }
    case "set_budget": {
      const month = input.month;
      if (typeof month !== "string" || !ISO_DATE.test(month)) {
        return { content: "month must be YYYY-MM-DD.", isError: true };
      }
      const period = periodList.find((p) => p.start_date <= month && p.end_date >= month);
      if (!period) {
        return {
          content: `No period covers ${month}. Tell the user to create that month on the Periods page first.`,
          isError: true,
        };
      }
      const category = findByName(
        categoryList.filter((c) => c.kind === "expense"),
        input.category_name as string | undefined,
      );
      if (!category) {
        return { content: `No expense category found matching "${input.category_name}".`, isError: true };
      }
      const rawPlanned = typeof input.planned_amount === "number" ? input.planned_amount : NaN;
      if (!Number.isFinite(rawPlanned) || rawPlanned < 0) {
        return { content: "planned_amount must be a non-negative number.", isError: true };
      }
      const planned_amount = Math.round(rawPlanned * 100) / 100;
      const { error } = await supabase
        .from("budget_lines")
        .upsert(
          { category_id: category.id, period_id: period.id, planned_amount },
          { onConflict: "category_id,period_id" },
        );
      if (error) return { content: `Failed to set budget: ${error.message}`, isError: true };
      return { content: `Set ${period.name} budget for "${category.name}" to ${planned_amount}.`, changed: true };
    }
    case "delete_transaction": {
      const id = typeof input.id === "string" ? input.id : "";
      if (!id) {
        return { content: "A transaction id is required — get one from search_transactions first.", isError: true };
      }
      const { data, error } = await supabase
        .from("transactions")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id)
        .is("deleted_at", null)
        .select("id");
      if (error) return { content: `Failed to delete transaction: ${error.message}`, isError: true };
      if (!data || data.length === 0) {
        return { content: "No matching (non-deleted) transaction with that id.", isError: true };
      }
      return { content: "Deleted transaction.", changed: true };
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

  const [{ data: accounts }, { data: categories }, { data: periods }, { data: objectives }] =
    await Promise.all([
      supabase
        .from("accounts")
        .select("id, name")
        .eq("is_active", true),
      supabase.from("categories").select("id, name, kind"),
      supabase.from("periods").select("id, name, start_date, end_date"),
      supabase.from("objectives").select("id, name").is("deleted_at", null),
    ]);

  const accountList = accounts ?? [];
  const categoryList = categories ?? [];
  const periodList = periods ?? [];
  const objectiveList = objectives ?? [];

  const today = new Date().toISOString().slice(0, 10);
  const currentPeriod =
    periodList.find((p) => p.start_date <= today && p.end_date >= today) ?? null;

  const system = `You are the AI financial advisor inside a household budget app shared by a couple. You do three things:

1. Answer questions about their finances — spending, budgets, balances, net worth, trends — using the read tools (get_account_balances, get_spending_summary, get_monthly_totals, search_transactions, get_safe_to_spend). Always look numbers up; never estimate or invent figures. If the data doesn't cover what they asked, say so.
2. Log income, expenses, and transfers they describe, using log_transaction.
3. Make other changes across the app on their behalf: create or delete a goal (create_goal, delete_goal), create or deactivate an account (create_account, deactivate_account), create or deactivate a category (create_category, deactivate_category), set a category's budget for a month (set_budget), and delete a transaction (delete_transaction — find its id with search_transactions first, never guess one).

Today's date is ${today}. "This month" means the first of this month through today; "last month" is the full previous calendar month.

Known accounts: ${accountList.map((a) => a.name).join(", ") || "(none yet)"}
Known expense categories: ${categoryList.filter((c) => c.kind === "expense").map((c) => c.name).join(", ") || "(none yet)"}
Known income categories: ${categoryList.filter((c) => c.kind === "income").map((c) => c.name).join(", ") || "(none yet)"}
Known goals: ${objectiveList.map((o) => o.name).join(", ") || "(none yet)"}

Logging: they often paste or dictate a whole batch at once — several expenses, a paycheck, and a transfer in one message, sometimes as a list. Parse the entire message and call log_transaction once per transaction, in the order mentioned. For a transfer, set account_name to where the money leaves and to_account_name to where it lands, and never set category_name. Match account and category names to the known lists above — small wording differences are fine. If a field is truly unclear for one item (e.g. no amount), ask about just that one and still log everything else that was clear. After logging, confirm briefly; for more than one, use a short list.

Making changes: go ahead and do what's asked — deleting an account/category deactivates it (history is kept, fully reversible from the app), and deleting a goal or transaction is soft-deleted the same way the app's own "Undo" toast works, so none of this is destructive. Only ask first if the request is genuinely ambiguous (which of two similarly-named accounts, which transaction among several matches). After a change, confirm briefly what you did.

Answering: lead with the direct answer and the key number, then only the detail that matters. When an answer has several parts, use short "## " headings and "- " bullet lists, and **bold** the key figure sparingly. Keep it concise. For general money guidance beyond their own data, be practical and mention you're not a licensed financial advisor.`;

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
  // Counts every change that actually landed — a logged transaction or any
  // WRITE_TOOLS action — so the client knows whether to refresh server data.
  let changedCount = 0;

  for (let i = 0; i < MAX_STEPS; i++) {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: [FALLBACK_BETA],
      fallbacks: [{ model: FALLBACK_MODEL }],
      output_config: { effort: "medium" },
      system,
      tools: [LOG_TRANSACTION_TOOL, ...WRITE_TOOLS, ...READ_TOOLS],
      messages,
    });

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "refusal") {
      return NextResponse.json({
        reply:
          "I can't help with that one. Try asking about your spending, budget, or balances, or tell me something to log or change.",
        state: messages,
        changedCount,
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
        changedCount,
      });
    }

    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use",
    );

    const toolResults: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const block of toolUseBlocks) {
      if (block.name !== "log_transaction") {
        try {
          const write = await runWriteTool(block.name, block.input as Record<string, unknown>, {
            supabase,
            accountList,
            categoryList,
            objectiveList,
            periodList,
          });
          if (write) {
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: write.content,
              is_error: write.isError,
            });
            if (write.changed) {
              changedCount++;
              revalidateHousehold();
            }
            continue;
          }

          const read = await runReadTool(
            block.name,
            block.input as Record<string, unknown>,
            currentPeriod ? { id: currentPeriod.id, name: currentPeriod.name } : null,
          );
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
            content: `Action failed: ${err instanceof Error ? err.message : "unknown error"}`,
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

      // The tool description tells the model this is a positive amount, but
      // that's only a hint the model can still get wrong (a misread refund,
      // a stray minus sign). Every balance and budget total downstream just
      // adds this in with a sign that assumes it's positive, so an
      // unvalidated negative here would silently flip the wrong direction
      // instead of erroring — the same check the Shortcuts API already does
      // for this same insert.
      const amount = Math.round(Number(input.amount) * 100) / 100;
      if (!Number.isFinite(amount) || amount <= 0) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: `"${input.amount}" isn't a valid positive amount. Ask the user for the correct amount instead of guessing.`,
          is_error: true,
        });
        continue;
      }

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

      if (isTransfer && (!account || !toAccount)) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: `Couldn't match both accounts for this transfer (from "${input.account_name ?? ""}" to "${input.to_account_name ?? ""}"). Ask the user which accounts they mean.`,
          is_error: true,
        });
        continue;
      }

      // Same rule as the manual "Add transfer" form: every transfer is
      // simply "Transfer", whatever the model generated.
      // For everything else, running it through the same cleanup CSV import
      // uses keeps merchant names consistent regardless of entry path — a
      // pasted statement line ("CHICK-FIL-A #05927") comes out the same way
      // here as it would through the importer ("Chick Fil A").
      const description = isTransfer
        ? "Transfer"
        : cleanMerchantDescription(input.description);

      let category = isTransfer
        ? null
        : findByName(
            categoryList.filter((c) => c.kind === input.kind),
            input.category_name,
          );

      // The model re-guesses a category fresh on every call, which drifts
      // for the same merchant across separate messages. When it didn't name
      // one (or named one that didn't match anything), fall back to the
      // same history-based lookup the manual Quick Add form already uses —
      // whatever category this exact description was actually filed under
      // most recently — so logging via chat is at least as consistent as
      // logging by hand.
      if (!category && !isTransfer) {
        const suggestedId = await suggestCategoryForDescription(description);
        if (suggestedId) {
          category = categoryList.find((c) => c.id === suggestedId) ?? null;
        }
      }

      const { error } = await supabase.from("transactions").insert({
        kind: input.kind,
        description,
        amount,
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

      changedCount++;
      revalidateHousehold(["transactions"]);
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
    changedCount,
  });
}
