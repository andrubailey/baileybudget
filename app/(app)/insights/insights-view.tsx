"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/format";
import { getCategoryColor } from "@/lib/category-colors";
import {
  CARD_TITLES,
  INSIGHTS_RANGE_OPTIONS,
  type HideableCardId,
  type InsightsCardId,
  type InsightsPrefs,
  type InsightsRangeKey,
} from "@/lib/insights-prefs";
import type {
  BudgetCardData,
  CashFlowCardData,
  Finding,
  GoalsCardData,
  HistoryCardData,
  InsightsData,
  Part,
  RecurringCardData,
  WhereCardData,
} from "@/lib/insights";
import { CategoryChip } from "@/app/(app)/category-chip";
import { DatePicker } from "@/app/(app)/date-picker";
import { Dropdown } from "@/app/(app)/dropdown";
import { SegmentedProgress } from "@/app/(app)/segmented-progress";
import { useToast } from "@/app/(app)/toast";
import { saveInsightsPrefs } from "./actions";

// Card sizes on the 12-column desktop grid — sized by what each card
// carries, with the headline slot (the most significant observation for the
// selected range) the largest.
const SPAN: Record<HideableCardId, string> = {
  headline: "lg:col-span-8",
  cashflow: "lg:col-span-4",
  where: "lg:col-span-6",
  history: "lg:col-span-6",
  noticing: "lg:col-span-12",
  budget: "lg:col-span-4",
  goals: "lg:col-span-4",
  recurring: "lg:col-span-4",
};

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

// Every figure on the page is one of these: a link to the transactions
// behind it, dotted-underlined so it reads as checkable without shouting.
function Num({ href, children, className = "" }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={`tabular underline decoration-text-faint decoration-dotted underline-offset-4 transition-colors hover:text-accent hover:decoration-accent ${className}`}
    >
      {children}
    </Link>
  );
}

function Sentence({ parts, className = "" }: { parts: Part[]; className?: string }) {
  return (
    <p className={className}>
      {parts.map((part, i) =>
        typeof part === "string" ? (
          <span key={i}>{part}</span>
        ) : (
          <Num key={i} href={part.href} className="font-semibold text-text">
            {part.text}
          </Num>
        ),
      )}
    </p>
  );
}

function NotEnough({ reason }: { reason: string }) {
  return (
    <div className="flex flex-1 items-center gap-2.5 rounded-lg bg-bg px-3 py-3 text-sm text-text-muted">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0 text-text-faint">
        <path d="M12 8v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
      </svg>
      {reason}
    </div>
  );
}

function pctWords(pct: number) {
  const rounded = Math.round(pct);
  if (rounded === 0) return "About the same as";
  return `${rounded > 0 ? "Up" : "Down"} ${Math.abs(rounded)}% from`;
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

function CashFlowBody({ data }: { data: CashFlowCardData }) {
  const max = Math.max(data.income, data.spending, 1);
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="text-text-muted">Money in</span>
          <Num href={data.incomeHref} className="font-semibold text-text">
            {formatMoney(data.income)}
          </Num>
        </div>
        <SegmentedProgress pct={(data.income / max) * 100} overBudget={false} color="var(--positive)" className="mt-2" />
      </div>
      <div>
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="text-text-muted">Money out</span>
          <Num href={data.spendingHref} className="font-semibold text-text">
            {formatMoney(data.spending)}
          </Num>
        </div>
        <SegmentedProgress pct={(data.spending / max) * 100} overBudget={false} className="mt-2" />
      </div>
      <div className="border-t border-border pt-3 text-sm">
        <p className="flex items-baseline justify-between gap-3">
          <span className="text-text-muted">In minus out</span>
          <span className="tabular font-semibold text-text">
            {data.net < 0 ? "−" : ""}
            {formatMoney(Math.abs(data.net))}
          </span>
        </p>
        {data.savingsRate !== null && (
          <p className="tabular mt-1 text-xs text-text-faint">
            {data.savingsRate >= 0
              ? `${Math.round(data.savingsRate * 100)}% of money in was kept`
              : `Money out was ${Math.round(Math.abs(data.savingsRate) * 100)}% more than money in`}
            {data.partial ? " so far" : ""}
          </p>
        )}
      </div>
    </div>
  );
}

function WhereBody({ data, large }: { data: WhereCardData; large?: boolean }) {
  if (data.status !== "ok") return <NotEnough reason={data.reason} />;
  return (
    <div>
      <p className="text-sm text-text-muted">
        <Num href={data.totalHref} className={`font-semibold text-text ${large ? "text-balance-display" : "text-xl"}`}>
          {formatMoney(data.total)}
        </Num>{" "}
        spent
      </p>
      <ul className="mt-4 space-y-3">
        {data.categories.map((c) => (
          <li key={c.id}>
            <div className="flex items-center justify-between gap-3">
              <CategoryChip id={c.id} name={c.name} icon={c.icon} className="min-w-0" />
              <span className="flex shrink-0 items-baseline gap-2 text-sm">
                <Num href={c.href} className="font-medium text-text">
                  {formatMoney(c.amount)}
                </Num>
                <span className="tabular w-10 text-right text-xs text-text-faint">{Math.round(c.share * 100)}%</span>
              </span>
            </div>
            <SegmentedProgress pct={c.share * 100} overBudget={false} color={getCategoryColor(c.id)} className="mt-1.5" />
          </li>
        ))}
      </ul>
      {data.moreCount > 0 && (
        <p className="mt-3 text-xs text-text-faint">
          Plus {data.moreCount} smaller {data.moreCount === 1 ? "category" : "categories"} —{" "}
          <Num href={data.totalHref}>see all spending</Num>
        </p>
      )}
    </div>
  );
}

function HistoryBody({ data, large }: { data: HistoryCardData; large?: boolean }) {
  if (data.status !== "ok") return <NotEnough reason={data.reason} />;
  const single = data.priorWindows.length === 1;
  return (
    <div className="space-y-3">
      <p className={`font-semibold tracking-tight text-text ${large ? "text-2xl" : "text-lg"}`}>
        {data.pct === null
          ? "No spending in the earlier window to compare against."
          : `${pctWords(data.pct)} ${data.comparisonLabel}`}
      </p>
      <p className="text-sm text-text-muted">
        <Num href={data.currentHref} className="font-semibold text-text">
          {formatMoney(data.current)}
        </Num>{" "}
        spent in this range, against{" "}
        {single ? (
          <>
            <Num href={data.priorWindows[0].href} className="font-semibold text-text">
              {formatMoney(data.priorWindows[0].amount)}
            </Num>{" "}
            in {data.priorWindows[0].label}.
          </>
        ) : (
          <>
            an average of <span className="tabular font-semibold text-text">{formatMoney(data.priorAverage)}</span> (
            {data.priorWindows.map((w, i) => (
              <span key={w.label}>
                {i > 0 && ", "}
                {w.label}:{" "}
                <Num href={w.href} className="text-text">
                  {formatMoney(w.amount)}
                </Num>
              </span>
            ))}
            ).
          </>
        )}
      </p>
      {data.typical && (
        <p className="border-t border-border pt-3 text-xs text-text-muted">
          A typical month over your last {data.typical.months} months ran{" "}
          <Num href={data.typical.baselineHref} className="text-text">
            {formatMoney(data.typical.low)}
          </Num>
          –
          <Num href={data.typical.baselineHref} className="text-text">
            {formatMoney(data.typical.high)}
          </Num>
          . This range averaged{" "}
          <Num href={data.currentHref} className="text-text">
            {formatMoney(data.typical.perMonth)}
          </Num>{" "}
          a month —{" "}
          {data.typical.position === "within" ? "within that range" : `${data.typical.position} that range`}.
        </p>
      )}
    </div>
  );
}

function BudgetBody({ data }: { data: BudgetCardData }) {
  if (data.status !== "ok") return <NotEnough reason={data.reason} />;
  const pct = data.planned > 0 ? (data.spent / data.planned) * 100 : 0;
  return (
    <div className="space-y-3">
      <p className="text-sm text-text-muted">
        <Num href={data.spentHref} className="text-xl font-semibold text-text">
          {formatMoney(data.spent)}
        </Num>{" "}
        of{" "}
        <Link href="/spending/budget" className="tabular font-medium text-text hover:text-accent">
          {formatMoney(data.planned)}
        </Link>{" "}
        planned
      </p>
      <SegmentedProgress pct={pct} overBudget={data.spent > data.planned} />
      <p className="text-xs text-text-faint">
        {data.monthsLabel}
        {data.includesCurrentMonth ? " · includes the month so far" : ""}
      </p>
      <p className="border-t border-border pt-3 text-sm text-text-muted">
        {data.overCount === 0
          ? `All ${data.budgetedCount} budgeted categories stayed within plan.`
          : `${data.overCount} of ${data.budgetedCount} budgeted categories came in over plan.`}
      </p>
      {data.overCategories.length > 0 && (
        <ul className="space-y-2">
          {data.overCategories.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 text-sm">
              <CategoryChip id={c.id} name={c.name} icon={c.icon} size="xs" className="min-w-0" />
              <span className="shrink-0 text-xs text-text-faint">
                <Num href={c.href} className="font-medium text-text">
                  {formatMoney(c.spent)}
                </Num>{" "}
                of {formatMoney(c.planned)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function GoalsBody({ data }: { data: GoalsCardData }) {
  if (data.status !== "ok") return <NotEnough reason={data.reason} />;
  return (
    <ul className="space-y-4">
      {data.items.map((g) => (
        <li key={g.id}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-medium text-text">{g.name}</span>
            <span className="shrink-0 text-xs text-text-faint">
              <Num href={g.href} className="font-medium text-text">
                {formatMoney(g.current)}
              </Num>{" "}
              of {formatMoney(g.target)}
            </span>
          </div>
          <SegmentedProgress pct={g.pct * 100} overBudget={false} className="mt-1.5" />
          <p className="mt-1 text-xs text-text-faint">
            {g.monthlyAdded !== null && g.addedHref ? (
              <>
                {g.monthlyAdded >= 0 ? "Added about " : "Down about "}
                <Num href={g.addedHref}>{formatMoney(Math.abs(g.monthlyAdded))}</Num> a month over the last 3 months
              </>
            ) : (
              "Not enough history for a monthly rate yet"
            )}
            {g.projection ? ` · ${g.projection}` : ""}
          </p>
        </li>
      ))}
    </ul>
  );
}

function RecurringBody({ data }: { data: RecurringCardData }) {
  if (data.status !== "ok") return <NotEnough reason={data.reason} />;
  return (
    <div className="space-y-3">
      <p className="text-sm text-text-muted">
        <Link href="/spending/recurring" className="tabular text-xl font-semibold text-text hover:text-accent">
          {formatMoney(data.annualTotal)}
        </Link>{" "}
        a year
      </p>
      <p className="text-xs text-text-faint">
        {data.count} recurring {data.count === 1 ? "bill" : "bills"} · {formatMoney(data.monthlyTotal)} a month
        {data.share !== null ? ` · about ${Math.round(data.share * 100)}% of a typical month's spending` : ""}
      </p>
      <ul className="space-y-2 border-t border-border pt-3">
        {data.items.map((r) => (
          <li key={r.id} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-text">{r.description}</span>
            <span className="shrink-0 text-xs text-text-faint">
              <Num href={r.href} className="font-medium text-text">
                {formatMoney(r.monthly)}
              </Num>{" "}
              · {formatMoney(r.annual)}/yr
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const BASIS_LABEL: Record<Finding["basis"], string> = {
  statistical: "From your own history",
  threshold: "From your transactions",
  projection: "Projection at the current pace",
};

function FindingBody({ finding, large }: { finding: Finding; large?: boolean }) {
  const max = finding.series ? Math.max(1, ...finding.series.map((s) => s.value)) : 1;
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-bg px-2 py-0.5 text-[11px] font-semibold text-text-muted">{finding.label}</span>
        <span className="text-[11px] text-text-faint">{BASIS_LABEL[finding.basis]}</span>
      </div>
      <p className={`font-semibold tracking-tight text-text ${large ? "text-2xl" : "text-base"}`}>{finding.title}</p>
      <Sentence parts={finding.parts} className={`text-text-muted ${large ? "text-base" : "text-sm"}`} />
      {finding.series && (
        <div className={`mt-auto flex items-end gap-2 ${large ? "h-24" : "h-16"}`}>
          {finding.series.map((point) => (
            <Link
              key={point.label}
              href={point.href}
              title={`${point.label}: ${formatMoney(point.value)}`}
              className="group flex h-full flex-1 flex-col items-center justify-end gap-1"
            >
              <span
                className="w-full rounded-t-md bg-accent/70 transition-colors group-hover:bg-accent"
                style={{ height: `${Math.max(4, (point.value / max) * 100)}%` }}
              />
              <span className="text-[10px] text-text-faint">{point.label}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card shell, with the customize controls
// ---------------------------------------------------------------------------

function CardShell({
  id,
  title,
  customizing,
  hidden,
  canMove,
  onHide,
  onShow,
  onMove,
  onDropOn,
  className = "",
  children,
}: {
  id: HideableCardId;
  title: string;
  customizing: boolean;
  hidden: boolean;
  canMove: boolean;
  onHide: () => void;
  onShow: () => void;
  onMove?: (delta: -1 | 1) => void;
  onDropOn?: (draggedId: string) => void;
  className?: string;
  children: React.ReactNode;
}) {
  const draggable = customizing && canMove;
  return (
    <section
      draggable={draggable}
      onDragStart={draggable ? (e) => e.dataTransfer.setData("text/plain", id) : undefined}
      onDragOver={draggable ? (e) => e.preventDefault() : undefined}
      onDrop={
        draggable
          ? (e) => {
              e.preventDefault();
              onDropOn?.(e.dataTransfer.getData("text/plain"));
            }
          : undefined
      }
      className={`card flex min-w-0 flex-col ${SPAN[id]} ${customizing ? "ring-1 ring-border" : ""} ${
        hidden ? "opacity-45" : ""
      } ${draggable ? "cursor-grab active:cursor-grabbing" : ""} ${className}`}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-section-label">{title}</h2>
        {customizing && (
          <div className="flex items-center gap-1">
            {canMove && onMove && (
              <>
                <button
                  type="button"
                  onClick={() => onMove(-1)}
                  aria-label={`Move ${title} earlier`}
                  className="flex size-7 items-center justify-center rounded-md text-text-faint transition-colors hover:bg-bg hover:text-text"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => onMove(1)}
                  aria-label={`Move ${title} later`}
                  className="flex size-7 items-center justify-center rounded-md text-text-faint transition-colors hover:bg-bg hover:text-text"
                >
                  ↓
                </button>
              </>
            )}
            <button
              type="button"
              onClick={hidden ? onShow : onHide}
              className="rounded-md px-2 py-1 text-xs font-medium text-text-muted transition-colors hover:bg-bg hover:text-text"
            >
              {hidden ? "Show" : "Hide"}
            </button>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col">{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// The page view
// ---------------------------------------------------------------------------

export function InsightsView({
  data,
  initialPrefs,
  canSave,
}: {
  data: InsightsData;
  initialPrefs: InsightsPrefs;
  canSave: boolean;
}) {
  const router = useRouter();
  const showToast = useToast();
  const [prefs, setPrefs] = useState(initialPrefs);
  const [customizing, setCustomizing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [customStart, setCustomStart] = useState(data.range.start);
  const [customEnd, setCustomEnd] = useState(data.range.end);

  function persist(next: InsightsPrefs) {
    setPrefs(next);
    if (!canSave) return;
    saveInsightsPrefs(next).then((result) => {
      if (!result.ok) showToast(result.error ?? "Couldn't save your Insights layout");
    });
  }

  function applyRange(range: InsightsRangeKey, start?: string, end?: string) {
    const next: InsightsPrefs = {
      ...prefs,
      range,
      start: range === "custom" ? start : undefined,
      end: range === "custom" ? end : undefined,
    };
    persist(next);
    const params = new URLSearchParams({ range });
    if (range === "custom" && start && end) {
      params.set("start", start);
      params.set("end", end);
    }
    startTransition(() => router.push(`/insights?${params.toString()}`));
  }

  const isHidden = (id: HideableCardId) => prefs.hidden.includes(id);
  const hide = (id: HideableCardId) => persist({ ...prefs, hidden: [...prefs.hidden, id] });
  const show = (id: HideableCardId) => persist({ ...prefs, hidden: prefs.hidden.filter((h) => h !== id) });
  function move(id: InsightsCardId, delta: -1 | 1) {
    const order = [...prefs.order];
    const from = order.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= order.length) return;
    [order[from], order[to]] = [order[to], order[from]];
    persist({ ...prefs, order });
  }
  function dropOn(targetId: InsightsCardId, draggedId: string) {
    if (draggedId === targetId || !(prefs.order as string[]).includes(draggedId)) return;
    const order = prefs.order.filter((id) => id !== draggedId);
    order.splice(order.indexOf(targetId), 0, draggedId as InsightsCardId);
    persist({ ...prefs, order });
  }

  // The headline: the single most significant observation for this range.
  const headlineShown = !isHidden("headline");
  const headlineFinding =
    headlineShown && data.headline.kind === "finding"
      ? (data.findings.find((f) => f.id === (data.headline as { id: string }).id) ?? null)
      : null;
  const promotedCard = headlineShown && data.headline.kind === "card" ? data.headline.id : null;
  const noticing = data.findings.filter((f) => f.id !== headlineFinding?.id);

  const hiddenCount = prefs.hidden.length;

  function renderCard(id: InsightsCardId) {
    // A card promoted into the headline isn't repeated in its usual spot.
    if (id === promotedCard) return null;
    if (isHidden(id) && !customizing) return null;
    if (id === "noticing" && noticing.length === 0 && !customizing) return null;
    const common = {
      id,
      title: CARD_TITLES[id],
      customizing,
      hidden: isHidden(id),
      canMove: true,
      onHide: () => hide(id),
      onShow: () => show(id),
      onMove: (delta: -1 | 1) => move(id, delta),
      onDropOn: (dragged: string) => dropOn(id, dragged),
    };
    switch (id) {
      case "cashflow":
        return (
          <CardShell key={id} {...common}>
            <CashFlowBody data={data.cashflow} />
          </CardShell>
        );
      case "where":
        return (
          <CardShell key={id} {...common}>
            <WhereBody data={data.where} />
          </CardShell>
        );
      case "history":
        return (
          <CardShell key={id} {...common}>
            <HistoryBody data={data.history} />
          </CardShell>
        );
      case "budget":
        return (
          <CardShell key={id} {...common}>
            <BudgetBody data={data.budget} />
          </CardShell>
        );
      case "goals":
        return (
          <CardShell key={id} {...common}>
            <GoalsBody data={data.goals} />
          </CardShell>
        );
      case "recurring":
        return (
          <CardShell key={id} {...common}>
            <RecurringBody data={data.recurring} />
          </CardShell>
        );
      case "noticing":
        return (
          <CardShell key={id} {...common} className="bg-transparent p-0 shadow-none sm:p-0">
            {noticing.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-text-faint">
                Findings appear here only when something in the selected range is genuinely notable.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {noticing.map((f) => (
                  <div key={f.id} className="card flex flex-col">
                    <FindingBody finding={f} />
                  </div>
                ))}
              </div>
            )}
          </CardShell>
        );
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Dropdown
            variant="pill"
            aria-label="Time range"
            value={prefs.range}
            onChange={(next) => {
              const key = next as InsightsRangeKey;
              if (key === "custom") applyRange("custom", customStart, customEnd);
              else applyRange(key);
            }}
            options={INSIGHTS_RANGE_OPTIONS.map((o) => ({ value: o.key, label: o.label }))}
          />
          {prefs.range === "custom" && (
            <div className="flex items-center gap-2">
              <DatePicker
                variant="pill"
                aria-label="Start date"
                value={customStart}
                max={customEnd || undefined}
                onChange={(next) => {
                  setCustomStart(next);
                  if (next && customEnd) applyRange("custom", next, customEnd);
                }}
              />
              <span className="text-text-faint">–</span>
              <DatePicker
                variant="pill"
                aria-label="End date"
                value={customEnd}
                min={customStart || undefined}
                onChange={(next) => {
                  setCustomEnd(next);
                  if (customStart && next) applyRange("custom", customStart, next);
                }}
              />
            </div>
          )}
          <span className="tabular text-sm text-text-muted">{data.rangeText}</span>
          {pending && <span className="text-xs text-text-faint">Updating…</span>}
        </div>
        <div className="flex items-center gap-3">
          {!customizing && hiddenCount > 0 && (
            <span className="text-xs text-text-faint">
              {hiddenCount} hidden {hiddenCount === 1 ? "card" : "cards"}
            </span>
          )}
          <button
            type="button"
            onClick={() => setCustomizing((v) => !v)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
              customizing
                ? "border-accent bg-accent text-white hover:opacity-90"
                : "border-border text-text-muted hover:bg-bg hover:text-text"
            }`}
          >
            {customizing ? "Done" : "Customize"}
          </button>
        </div>
      </div>

      {customizing && (
        <p className="text-sm text-text-muted">
          Drag cards or use the arrows to reorder them, and hide the ones you don&apos;t need.
          {!canSave && " Run supabase/030_profile_insights_prefs.sql to save this layout to your profile."}
        </p>
      )}

      <div
        className={`grid grid-cols-1 gap-6 transition-opacity lg:grid-flow-row-dense lg:grid-cols-12 ${
          pending ? "opacity-60" : ""
        }`}
      >
        {(headlineShown || customizing) && (
          <CardShell
            id="headline"
            title={
              headlineFinding ? "Headline" : promotedCard ? `Headline · ${CARD_TITLES[promotedCard]}` : "Headline"
            }
            customizing={customizing}
            hidden={!headlineShown}
            canMove={false}
            onHide={() => hide("headline")}
            onShow={() => show("headline")}
            className="lg:row-span-1"
          >
            {!headlineShown ? (
              <p className="text-sm text-text-faint">The most significant observation for the selected range.</p>
            ) : headlineFinding ? (
              <FindingBody finding={headlineFinding} large />
            ) : promotedCard === "history" ? (
              <HistoryBody data={data.history} large />
            ) : (
              <WhereBody data={data.where} large />
            )}
          </CardShell>
        )}
        {prefs.order.map((id) => renderCard(id))}
      </div>

      {data.trackingStartLabel && (
        <p className="text-xs text-text-faint">
          History for comparisons starts {data.trackingStartLabel}, the first month with regular tracking.
        </p>
      )}
    </div>
  );
}
