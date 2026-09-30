import type { Metadata } from "next";
import Link from "next/link";
import { HeroCard, PageHeader, Row, SectionHeader } from "@/components/ui";
import { getAccountsWithBalances, getObjectives } from "@/lib/queries";
import { EmptyState } from "@/app/(app)/empty-state";
import { Chevron } from "@/app/(app)/home/chevron";
import { BudgetCategoryRow } from "./budget-category-row";
import { categoryCaption } from "./captions";
import { getMonthPlan, plural, wholeDollars, type MonthPlan } from "./month-plan";
import { PaceChart } from "./pace-chart";

export const metadata: Metadata = { title: "Budget" };

const TOP_CATEGORIES = 5;
const CARD = "rounded-(--radius-card) bg-(--bg-card) px-(--space-4)";

// Money (the mobile Budget tab) answers one question: how is this month's
// plan going? The hero card answers it; categories, goals and bills are
// the supporting detail, each capped or collapsed so the answer stays
// inside the first screenful. Full detail lives on the desktop pages the
// links point to.
export default async function MoneyPage() {
  const [plan, objectives, accounts] = await Promise.all([
    getMonthPlan(),
    getObjectives(),
    getAccountsWithBalances(),
  ]);

  if (!plan) {
    return (
      <p className="ui-body text-(--text-secondary)">
        Couldn&apos;t set up this month&apos;s period automatically. Try reloading the page.
      </p>
    );
  }

  const { period, clock, budgeted } = plan;
  // Which five: the ones closest to or past their limit (getMonthPlan's
  // order). How they're listed: alphabetically, so a category is always
  // where you expect it.
  const shown = budgeted
    .slice(0, TOP_CATEGORIES)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  return (
    <div className="mx-auto w-full max-w-md">
      <PageHeader
        title={period.name}
        subtitle={clock.daysLeft === 1 ? "Last day of the month" : `${plural(clock.daysLeft, "day")} remaining`}
      />

      <PlanHero plan={plan} />

      <section>
        <SectionHeader
          title="Categories"
          action={
            budgeted.length > TOP_CATEGORIES ? { href: "/spending/budget", label: `All ${budgeted.length}` } : undefined
          }
        />
        <div className={`${CARD} divide-y divide-(--border-subtle)`}>
          {shown.length === 0 ? (
            <EmptyState compact message="No budget set for this month." />
          ) : (
            shown.map((c) => (
              <BudgetCategoryRow
                key={c.id}
                category={c}
                caption={categoryCaption({
                  planned: c.planned,
                  actual: c.actual,
                  elapsedPct: clock.elapsedPct,
                  pendingBills: plan.pendingBillsByCategory.get(c.id) ?? 0,
                  hasBills: plan.billCategoryIds.has(c.id),
                })}
                editablePeriodId={period.id}
                plannedLocked={period.budget_locked_at !== null}
              />
            ))
          )}
        </div>
      </section>

      <div className={`${CARD} mt-(--space-6) divide-y divide-(--border-subtle)`}>
        <SavingForRow objectives={objectives} accounts={accounts} />
        <BillsRow plan={plan} />
      </div>
    </div>
  );
}

function PlanHero({ plan }: { plan: MonthPlan }) {
  const { planned, spent, remaining, billsStillToCome, clock } = plan;
  const outside = plan.notBudgeted.reduce((sum, c) => sum + c.actual, 0);
  const outsideNote =
    outside > 0 ? (
      <p className="ui-caption ui-tabular mt-(--space-3)">
        Plus {wholeDollars(outside)} outside the budget ({plan.notBudgeted.map((c) => c.name).join(", ")}).
      </p>
    ) : null;

  if (planned <= 0) {
    return (
      <HeroCard
        label="Spent so far"
        value={spent}
        caption={
          <>
            No plan set for {plan.period.name} yet.{" "}
            {/* Primary text + underline: the accent green is under 4.5:1
                on this card (WCAG 1.4.3). */}
            <Link href="/spending/budget" className="font-medium text-(--text-primary) underline underline-offset-2">
              Set one
            </Link>
          </>
        }
      >
        {outsideNote}
      </HeroCard>
    );
  }

  const over = remaining < 0;
  const days = clock.daysLeft === 1 ? "on the last day" : `with ${plural(clock.daysLeft, "day")} to go`;
  const caption = over
    ? `${wholeDollars(spent)} spent against a ${wholeDollars(planned)} plan, ${days}.`
    : `${wholeDollars(spent)} spent of ${wholeDollars(planned)} planned${
        billsStillToCome > 0 ? `, with ${wholeDollars(billsStillToCome)} of bills still to come` : `, ${days}`
      }.`;
  const expectedToday = plan.expectedByDay[clock.today - 1] ?? 0;

  return (
    <HeroCard
      label={over ? "Over the plan by" : "Left in the plan"}
      status={plan.pace ?? undefined}
      value={Math.abs(remaining)}
      caption={caption}
    >
      <PaceChart
        actual={plan.actualByDay}
        expected={plan.expectedByDay}
        label={`Spending so far this month: ${wholeDollars(spent)}. At the planned pace it would be about ${wholeDollars(
          expectedToday,
        )} by today, and ${wholeDollars(planned)} by the end of the month.`}
      />
      {outsideNote}
    </HeroCard>
  );
}

function SavingForRow({
  objectives,
  accounts,
}: {
  objectives: Awaited<ReturnType<typeof getObjectives>>;
  accounts: Awaited<ReturnType<typeof getAccountsWithBalances>>;
}) {
  const open = objectives
    .filter((o) => o.status !== "Achieved")
    .sort(
      (a, b) =>
        (a.end_date ? 0 : 1) - (b.end_date ? 0 : 1) || (a.end_date ?? "").localeCompare(b.end_date ?? ""),
    );
  if (open.length === 0) return null;

  // Only a goal backed by a real account balance gets a percentage — a
  // date-elapsed guess would read as savings progress when it isn't.
  const first = open[0];
  const linked = first.linked_account_id ? accounts.find((a) => a.id === first.linked_account_id) : undefined;
  const pct = linked?.goal && linked.goal > 0 ? Math.min(100, Math.max(0, (linked.balance / linked.goal) * 100)) : null;
  const more = open.length - 1;

  return (
    <Row
      href="/goals"
      title="Saving for"
      subtitle={`${first.name}${pct !== null ? `, ${Math.round(pct)}% there` : ""}${
        more > 0 ? `, and ${plural(more, "more goal")}` : ""
      }`}
      value={<Chevron />}
    />
  );
}

function BillsRow({ plan }: { plan: MonthPlan }) {
  const left = plan.bills.filter((b) => b.status !== "posted");
  const total = left.reduce((sum, b) => sum + b.amount, 0);
  return (
    <Row
      href="/spending/recurring"
      title="Bills"
      subtitle={
        plan.bills.length === 0
          ? "None set up"
          : left.length === 0
            ? "All paid this month"
            : `${left.length} left this month, about ${wholeDollars(total)}`
      }
      value={<Chevron />}
    />
  );
}
