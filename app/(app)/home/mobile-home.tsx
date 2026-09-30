import Link from "next/link";
import { headers } from "next/headers";
import { HeroCard, PageHeader, Row, SectionHeader } from "@/components/ui";
import { getTable } from "@/lib/snapshot";
import { getHouseholdNames } from "@/lib/profile";
import { getAccountsWithBalances } from "@/lib/queries";
import { formatMoney } from "@/lib/format";
import { getMonthPlan, plural, wholeDollars, type MonthBill, type MonthPlan } from "@/app/(app)/budget/month-plan";
import { LocalDateTitle } from "./local-date-title";

const MAX_ATTENTION_ITEMS = 3;
const CARD = "rounded-(--radius-card) bg-(--bg-card) px-(--space-4) divide-y divide-(--border-subtle)";

// Today's date where the viewer is. Vercel sends the visitor's timezone,
// so the server renders the right date and the heading doesn't swap after
// load; locally there's no header and LocalDateTitle corrects it on mount.
async function viewerTodayIso(): Promise<string> {
  const tz = (await headers()).get("x-vercel-ip-timezone");
  if (tz) {
    try {
      return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
    } catch {
      // Unrecognized zone name — fall through to UTC.
    }
  }
  return new Date().toISOString().slice(0, 10);
}

// Mobile Home answers one question: how much do we have to spend? The hero
// card answers it; "Due this week" and "Today" are the only other things
// here, and "Today" disappears entirely when nothing needs us. Everything
// else the desktop dashboard shows (net worth, income, expenses, calendar,
// goals, recent transactions) is desktop-only or on its own tab.
export async function MobileHome({ fallbackName }: { fallbackName: string }) {
  const [plan, names, transactions, splits, accounts, todayIso] = await Promise.all([
    getMonthPlan(),
    getHouseholdNames(),
    getTable("transactions"),
    getTable("transaction_splits"),
    getAccountsWithBalances(),
    viewerTodayIso(),
  ]);
  const household = joinNames(names.length > 0 ? names : [fallbackName]);

  const attention = plan
    ? attentionItems({ plan, transactions, splits, accounts }).slice(0, MAX_ATTENTION_ITEMS)
    : [];

  return (
    <div className="mx-auto w-full max-w-md">
      <PageHeader title={<LocalDateTitle serverIso={todayIso} />} subtitle={household} />

      {plan ? (
        <>
          <LeftToSpendHero plan={plan} />
          <DueThisWeek bills={plan.bills} />
        </>
      ) : (
        <p className="ui-body text-(--text-secondary)">
          Couldn&apos;t set up this month&apos;s period automatically. Try reloading the page.
        </p>
      )}

      {attention.length > 0 && (
        <section>
          <SectionHeader title="Today" />
          <div className={CARD}>
            {attention.map((item) => (
              <Row
                key={item.key}
                title={item.title}
                subtitle={item.context}
                value={
                  <Link
                    href={item.action.href}
                    // 44px tall; the hidden suffix makes each link's name
                    // unique in a screen reader's links list (WCAG 2.4.9).
                    className="ui-pressable inline-flex min-h-11 items-center rounded-(--radius-pill) border border-(--border-subtle) px-(--space-4) text-(length:--text-caption) font-semibold text-(--text-primary)"
                  >
                    {item.action.label}
                    <span className="sr-only"> {item.action.subject}</span>
                  </Link>
                }
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

function LeftToSpendHero({ plan }: { plan: MonthPlan }) {
  const { planned, spent, remaining, leftAfterBills, billsStillToCome, clock, period } = plan;

  if (planned <= 0) {
    return <HeroCard label="Spent this month" value={spent} caption={`No plan set for ${period.name} yet.`} />;
  }

  let label: string;
  let value: number;
  let caption: string;
  if (leftAfterBills >= 0) {
    label = "Left to spend";
    value = leftAfterBills;
    caption =
      clock.daysLeft <= 1
        ? `${wholeDollars(leftAfterBills)} for the rest of today, after bills.`
        : `${wholeDollars(Math.floor(leftAfterBills / clock.daysLeft))} a day for ${clock.daysLeft} more days, after bills.`;
  } else if (remaining > 0) {
    label = "Short after bills";
    value = -leftAfterBills;
    caption = `Bills still to come are ${wholeDollars(-leftAfterBills)} more than what's left in the plan.`;
  } else {
    label = "Over the plan by";
    value = -remaining;
    caption = `Spending has passed this month's plan${
      clock.daysLeft > 1 ? `, with ${clock.daysLeft} days to go` : ""
    }${billsStillToCome > 0 ? ` and ${wholeDollars(billsStillToCome)} in bills still to come` : ""}.`;
  }

  const ratio = Math.min(1, Math.max(0, spent / planned));
  return (
    <HeroCard label={label} value={value} caption={caption} status={plan.pace ?? undefined}>
      {/* Decorative: the line below it states the same fact in words. */}
      <span className="ui-progress-track block" aria-hidden="true">
        <span
          className="ui-progress-fill block"
          style={{
            background: remaining < 0 ? "var(--accent-caution)" : "var(--accent-positive)",
            transform: `scaleX(${ratio})`,
          }}
        />
      </span>
      <p className="ui-caption ui-tabular mt-(--space-2)">
        {wholeDollars(spent)} of {wholeDollars(planned)} spent this month
      </p>
    </HeroCard>
  );
}

function dueLabel(daysUntil: number): string {
  if (daysUntil === 0) return "Today";
  if (daysUntil === 1) return "Tomorrow";
  return `In ${daysUntil} days`;
}

// "~$85" on screen, "about $85" to a screen reader (VoiceOver says "tilde").
function About({ amount }: { amount: number }) {
  return (
    <>
      <span aria-hidden="true">~</span>
      <span className="sr-only">about </span>
      {wholeDollars(amount)}
    </>
  );
}

function DueThisWeek({ bills }: { bills: MonthBill[] }) {
  // Overdue bills are in "Today" instead — this is what's coming.
  const upcoming = bills
    .filter((b) => b.status !== "overdue" && b.daysUntil >= 0 && b.daysUntil <= 6)
    .sort((a, b) => a.daysUntil - b.daysUntil);
  const total = upcoming.reduce((sum, b) => sum + b.amount, 0);

  return (
    <section>
      <SectionHeader title="Due this week" action={{ href: "/spending/recurring", label: "All bills" }} />
      <p className="ui-caption ui-tabular -mt-(--space-1) mb-(--space-3)">
        {upcoming.length === 0
          ? "Nothing due in the next 7 days."
          : `${plural(upcoming.length, "bill")} in the next 7 days, about ${wholeDollars(total)} all together.`}
      </p>
      {upcoming.length > 0 && (
        <div className={CARD}>
          {upcoming.map((b) => {
            const date = new Date(`${b.nextIso}T12:00:00Z`);
            return (
              <Row
                key={b.id}
                leading={
                  <span
                    className="flex w-10 flex-col items-center rounded-(--radius-field) bg-(--bg-card-subtle) py-(--space-1) leading-tight"
                    aria-hidden="true"
                  >
                    <span className="ui-label">
                      {date.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })}
                    </span>
                    <span className="ui-body ui-tabular font-semibold text-(--text-primary)">{date.getUTCDate()}</span>
                  </span>
                }
                title={b.description}
                subtitle={`${dueLabel(b.daysUntil)}, ${date.toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "short",
                  day: "numeric",
                  timeZone: "UTC",
                })}`}
                value={<About amount={b.amount} />}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

type AttentionItem = {
  key: string;
  title: string;
  context: string;
  // `subject` is read after the label by screen readers only ("Review
  // overdue bills"), so identical visible labels stay distinguishable.
  action: { label: string; href: string; subject: string };
};

// Things that need one of us to do something, most time-sensitive first.
// Only real problems — no "all caught up!" filler; an empty list hides the
// section entirely.
function attentionItems({
  plan,
  transactions,
  splits,
  accounts,
}: {
  plan: MonthPlan;
  transactions: Awaited<ReturnType<typeof getTable>>;
  splits: Awaited<ReturnType<typeof getTable>>;
  accounts: Awaited<ReturnType<typeof getAccountsWithBalances>>;
}): AttentionItem[] {
  const items: AttentionItem[] = [];

  const overdue = plan.bills.filter((b) => b.status === "overdue");
  if (overdue.length > 0) {
    const total = overdue.reduce((sum, b) => sum + b.amount, 0);
    items.push({
      key: "overdue-bills",
      title: overdue.length === 1 ? `${overdue[0].description} hasn't posted` : `${overdue.length} bills haven't posted`,
      context:
        overdue.length === 1
          ? `Was due ${new Date(`${overdue[0].dueIso}T12:00:00Z`).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              timeZone: "UTC",
            })}, about ${wholeDollars(total)}`
          : `${overdue
              .map((b) => b.description)
              .slice(0, 2)
              .join(", ")}${overdue.length > 2 ? ", and more" : ""}, about ${wholeDollars(total)}`,
      action: { label: "Review", href: "/spending/recurring", subject: "bills that haven't posted" },
    });
  }

  const low = accounts.filter(
    (a) => a.is_active && !a.is_debt && a.low_balance_alert !== null && a.balance < a.low_balance_alert,
  );
  if (low.length > 0) {
    items.push({
      key: "low-balance",
      title: low.length === 1 ? `${low[0].name} is below its alert` : `${low.length} accounts are below their alerts`,
      context:
        low.length === 1
          ? `${formatMoney(low[0].balance)} now, alert set at ${formatMoney(low[0].low_balance_alert!)}`
          : low.map((a) => a.name).join(", "),
      action: { label: "View", href: "/balances", subject: "low-balance accounts" },
    });
  }

  const active = transactions.filter((t) => t.deleted_at == null);
  const pending = active.filter((t) => t.pending_approval === true);
  if (pending.length > 0) {
    const total = pending.reduce((sum, t) => sum + Number(t.amount), 0);
    items.push({
      key: "pending",
      title: `${plural(pending.length, "purchase")} waiting for approval`,
      context: `About ${wholeDollars(total)} in total`,
      action: { label: "Review", href: "/transactions?flag=pending", subject: "purchases waiting for approval" },
    });
  }

  // Same rule as the app-wide banner: a split parent has no category_id but
  // isn't uncategorized.
  const splitParents = new Set(splits.map((s) => s.transaction_id));
  const uncategorized = active.filter(
    (t) => t.kind !== "transfer" && t.category_id === null && !splitParents.has(t.id),
  );
  if (uncategorized.length > 0) {
    const total = uncategorized.reduce((sum, t) => sum + Number(t.amount), 0);
    items.push({
      key: "uncategorized",
      title: `${plural(uncategorized.length, "transaction")} need${uncategorized.length === 1 ? "s" : ""} a category`,
      context: `About ${wholeDollars(total)} isn't counted in the budget yet`,
      action: { label: "Sort", href: "/transactions?flag=uncategorized", subject: "transactions without a category" },
    });
  }

  if (plan.planned <= 0) {
    items.push({
      key: "no-plan",
      title: `No plan for ${plan.period.name} yet`,
      context: "Spending is tracked, but there's nothing to measure it against",
      action: { label: "Plan", href: "/spending/budget", subject: `the ${plan.period.name} budget` },
    });
  }

  return items;
}
