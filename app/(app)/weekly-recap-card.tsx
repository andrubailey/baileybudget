"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { formatDate, formatMoney } from "@/lib/format";
import { CategoryIcon } from "@/app/(app)/category-icon";
import { getLetterColors } from "@/lib/letter-colors";
import { LogoMark } from "@/app/(app)/logo-mark";
import { SparkleIcon } from "@/app/(app)/sparkle-icon";

export type RecapData = {
  weekKey: string;
  rangeShort: string;
  rangeLong: string;
  netWorth: { start: number; end: number; points: number[] };
  spending: {
    total: number;
    previous: number;
    byDay: { letter: string; day: string; amount: number }[];
  };
  income: { total: number; previous: number };
  topCategories: { name: string; icon: string | null; amount: number }[];
  biggest: { description: string; amount: number; date: string } | null;
  transactionCount: number;
};

type Slide = {
  key: string;
  label: string;
  headline: string;
  visual: ReactNode;
  body: string[];
};

const DISMISS_KEY = "weekly-recap-dismissed";

// Diagonal streaks of olive, moss and deep green, like light through leaves.
// Shared by the Overview card and the recap's opening slide so opening the
// card feels like stepping into it rather than switching to a new look.
const RECAP_BACKGROUND = [
  "radial-gradient(90% 120% at 0% 20%, rgba(160,170,30,0.55) 0%, rgba(160,170,30,0) 60%)",
  "repeating-linear-gradient(125deg, rgba(26,64,6,0) 0px, rgba(26,64,6,0.55) 60px, rgba(26,64,6,0) 120px, rgba(110,140,40,0.35) 180px, rgba(26,64,6,0) 240px)",
  "linear-gradient(125deg, #6f8f1a 0%, #3f6b12 35%, #24500a 60%, #3c6a16 80%, #1f4708 100%)",
].join(", ");

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}

function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d={direction === "left" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"}
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const CONFIRM_MS = 4000;

export function WeeklyRecapCard({ data }: { data: RecapData }) {
  const [dismissed, setDismissed] = useState(false);
  const [open, setOpen] = useState(false);
  // "Reviewed" doesn't hide the card on the spot: it shows a confirmation
  // with an Undo for a few seconds first, and only then saves the dismissal.
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    // `?recap=1` on the Overview forces the card back and opens the story
    // straight away, ignoring a dismissal — for previewing a recap without
    // waiting for Saturday.
    const forced = new URLSearchParams(window.location.search).get("recap") === "1";
    if (forced) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the URL, an external system, after mount
      setDismissed(false);
      setOpen(true);
      return;
    }
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === data.weekKey);
    } catch {
      // localStorage unavailable — just keep showing the card
    }
  }, [data.weekKey]);

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => {
      setDismissed(true);
      try {
        localStorage.setItem(DISMISS_KEY, data.weekKey);
      } catch {
        // ignore
      }
    }, CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [confirming, data.weekKey]);

  if (dismissed) return null;

  return (
    <>
      <div
        className="animate-fade-in-up relative overflow-hidden rounded-xl text-white shadow-card"
        style={{ background: RECAP_BACKGROUND }}
      >
        <div className={`transition-opacity duration-200 ${confirming ? "pointer-events-none opacity-0" : ""}`}>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="block w-full px-5 pt-5 pb-3 text-left transition-colors hover:bg-white/10"
          >
            <p className="flex items-center gap-1.5 text-heading text-white">
              <SparkleIcon size={16} />
              Your weekly recap
            </p>
            <p className="mt-1 text-xs font-medium text-white/75">{data.rangeLong}</p>
            <RecapMonthCalendar weekStart={data.weekKey} />
          </button>
          {/* Its own row under the calendar — in the top corner it squeezed
              the title onto two lines. */}
          {/* Shaped like the Overview's New transaction button, full width, but
              white with green text so it stands out on the green card. */}
          <div className="px-5 pb-5">
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-accent transition-colors hover:bg-white/90"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Reviewed
            </button>
          </div>
        </div>

        {confirming && (
          <div
            role="status"
            className="animate-fade-in-up absolute inset-0 flex flex-col items-center justify-center gap-3 px-5 text-center"
          >
            <span className="flex size-10 items-center justify-center rounded-full bg-white/20">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <div>
              <p className="text-sm font-semibold text-white">Marked as reviewed</p>
              <p className="mt-0.5 text-xs text-white/75">Next recap arrives Saturday.</p>
            </div>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-full border border-white/50 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-white/15"
            >
              Undo
            </button>
          </div>
        )}
      </div>
      {open && <RecapStory data={data} onClose={() => setOpen(false)} />}
    </>
  );
}

const WEEKDAY_LETTERS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

// A small month calendar with the recap's Sunday–Saturday row highlighted.
// Shows the month the week ends in — a week that starts in one month and
// ends in the next belongs to the newer one. No panel behind it: the recap
// week is a soft pill with bright numbers, every other day is faded, and
// days from the neighboring months fade further.
function RecapMonthCalendar({ weekStart }: { weekStart: string }) {
  const start = new Date(`${weekStart}T00:00:00Z`);
  const end = new Date(start.getTime() + 6 * 86_400_000);
  const year = end.getUTCFullYear();
  const month = end.getUTCMonth();
  const first = new Date(Date.UTC(year, month, 1));
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  // Grid starts on the Sunday on or before the 1st.
  const gridStart = new Date(first.getTime() - first.getUTCDay() * 86_400_000);
  const weeks = Math.ceil((first.getUTCDay() + daysInMonth) / 7);
  const startMs = start.getTime();
  const monthLabel = end.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <div className="mt-4" aria-label={`${monthLabel}, recap week highlighted`}>
      <div className="grid grid-cols-7 text-center text-[11px] font-medium text-white/70">
        {WEEKDAY_LETTERS.map((l) => (
          <span key={l} className="py-1">
            {l}
          </span>
        ))}
      </div>
      <div className="mt-1 space-y-1">
        {Array.from({ length: weeks }, (_, w) => {
          const rowStart = gridStart.getTime() + w * 7 * 86_400_000;
          const isRecapWeek = rowStart === startMs;
          return (
            <div
              key={w}
              className={`grid grid-cols-7 rounded-full text-center text-[12px] tabular-nums ${
                isRecapWeek ? "bg-white/20 font-semibold text-white" : "text-white/40"
              }`}
            >
              {Array.from({ length: 7 }, (_, d) => {
                const date = new Date(rowStart + d * 86_400_000);
                const inMonth = date.getUTCMonth() === month;
                return (
                  <span key={d} className={`py-1.5 ${inMonth ? "" : "opacity-60"}`}>
                    {date.getUTCDate()}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RecapStory({ data, onClose }: { data: RecapData; onClose: () => void }) {
  const slides = buildSlides(data);
  const total = slides.length + 1;
  const [index, setIndex] = useState(0);
  const [closing, setClosing] = useState(false);
  const isCover = index === 0;

  function close() {
    setClosing(true);
    setTimeout(onClose, 150);
  }
  function next() {
    if (index >= total - 1) close();
    else setIndex(index + 1);
  }
  function prev() {
    setIndex((i) => Math.max(0, i - 1));
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  return createPortal(
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 ${
        closing ? "animate-modal-backdrop-out" : "animate-modal-backdrop"
      }`}
      onClick={close}
    >
      <div className="relative" onClick={(e) => e.stopPropagation()}>
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Weekly recap, ${data.rangeShort}`}
          className={`relative h-[min(720px,calc(100dvh-2rem))] w-[min(420px,calc(100vw-2rem))] overflow-hidden rounded-3xl shadow-modal ${
            isCover ? "" : "bg-bg"
          } ${closing ? "animate-modal-panel-out" : "animate-modal-panel"}`}
          style={isCover ? { background: RECAP_BACKGROUND } : undefined}
        >
          <button
            type="button"
            aria-label="Previous slide"
            onClick={prev}
            className="absolute top-16 bottom-0 left-0 z-[5] w-1/3 sm:hidden"
          />
          <button
            type="button"
            aria-label="Next slide"
            onClick={next}
            className="absolute top-16 right-0 bottom-0 z-[5] w-2/3 sm:hidden"
          />

          <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-4 px-5 pt-5">
            <LogoMark size={28} />
            <div className="flex flex-1 justify-center gap-1.5" aria-hidden="true">
              {Array.from({ length: total }, (_, i) => (
                <span
                  key={i}
                  className="h-[3px] w-5 rounded-full transition-colors duration-300"
                  style={{
                    backgroundColor:
                      i <= index
                        ? isCover
                          ? "#ffffff"
                          : "var(--text)"
                        : isCover
                          ? "rgba(255,255,255,0.35)"
                          : "var(--border)",
                  }}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close recap"
              className={`flex size-9 items-center justify-center rounded-full transition-colors ${
                isCover ? "text-white hover:bg-white/15" : "text-text-faint hover:bg-surface hover:text-text"
              }`}
            >
              <CloseIcon />
            </button>
          </div>

          {isCover ? (
            <div className="animate-fade-in-up flex h-full flex-col items-center justify-center px-8 text-center text-white">
              <span className="flex size-10 items-center justify-center rounded-full bg-white/15">
                <SparkleIcon size={18} strokeWidth={1.8} />
              </span>
              <p className="mt-3 card-label text-white/70">Personal recap</p>
              <h2 className="mt-3 text-[34px] leading-[1.1] font-semibold tracking-tight">Your weekly recap</h2>
              <p className="mt-2 text-sm text-white/80">{data.rangeShort}</p>
              <p className="mt-10 text-xs text-white/60">Tap or press → to begin</p>
            </div>
          ) : (
            <SlideView key={slides[index - 1].key} slide={slides[index - 1]} rangeShort={data.rangeShort} />
          )}
        </div>

        <button
          type="button"
          onClick={prev}
          disabled={index === 0}
          aria-label="Previous slide"
          className="absolute top-1/2 -left-20 hidden size-12 -translate-y-1/2 items-center justify-center rounded-full bg-surface text-text shadow-card transition-opacity disabled:opacity-40 sm:flex"
        >
          <Chevron direction="left" />
        </button>
        <button
          type="button"
          onClick={next}
          aria-label={index >= total - 1 ? "Finish recap" : "Next slide"}
          className="absolute top-1/2 -right-20 hidden size-12 -translate-y-1/2 items-center justify-center rounded-full bg-surface text-text shadow-card sm:flex"
        >
          <Chevron direction="right" />
        </button>
      </div>
    </div>,
    document.body,
  );
}

function SlideView({ slide, rangeShort }: { slide: Slide; rangeShort: string }) {
  return (
    <div className="animate-fade-in-up flex h-full flex-col overflow-y-auto px-6 pt-20 pb-8">
      <div className="flex items-center justify-between gap-4">
        <p className="card-label text-text-faint">{slide.label}</p>
        <p className="card-label text-text-faint">{rangeShort}</p>
      </div>
      <h2 className="text-page-title mt-4 text-text">{slide.headline}</h2>
      <div className="mt-6 rounded-2xl border border-border bg-surface p-5 shadow-card">{slide.visual}</div>
      <div className="mt-6 space-y-3 text-sm leading-relaxed text-text-muted">
        {slide.body.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
    </div>
  );
}

function buildSlides(data: RecapData): Slide[] {
  const { netWorth, spending, income, topCategories, biggest } = data;
  const slides: Slide[] = [];

  const nwChange = netWorth.end - netWorth.start;
  const nwPct = netWorth.start !== 0 ? (nwChange / Math.abs(netWorth.start)) * 100 : 0;
  const steady = Math.abs(nwPct) < 0.5;
  slides.push({
    key: "net-worth",
    label: "Net worth",
    headline: steady
      ? "Your net worth held steady this week"
      : nwChange > 0
        ? `Your net worth grew by ${formatMoney(nwChange)}`
        : `Your net worth dipped by ${formatMoney(-nwChange)}`,
    visual: <NetWorthVisual end={netWorth.end} pct={nwPct} points={netWorth.points} />,
    body: steady
      ? [`You closed the week at ${formatMoney(netWorth.end)}, within half a percent of where you started.`]
      : [
          `You closed the week at ${formatMoney(netWorth.end)}, ${nwChange > 0 ? "up" : "down"} ${formatMoney(Math.abs(nwChange))} from ${formatMoney(netWorth.start)}.`,
        ],
  });

  const diff = spending.total - spending.previous;
  const peak = spending.byDay.reduce((a, b) => (b.amount > a.amount ? b : a), spending.byDay[0]);
  slides.push({
    key: "spending",
    label: "Spending",
    headline:
      spending.total === 0
        ? "A no-spend week"
        : spending.previous === 0
          ? `You spent ${formatMoney(spending.total)} this week`
          : diff < 0
            ? `You spent ${formatMoney(-diff)} less than last week`
            : diff > 0
              ? `Spending ran ${formatMoney(diff)} higher than last week`
              : "You matched last week's spending",
    visual: <SpendingVisual total={spending.total} byDay={spending.byDay} />,
    body: [
      `${formatMoney(spending.total)} went out this week, compared with ${formatMoney(spending.previous)} the week before.`,
      ...(peak && peak.amount > 0
        ? [`${peak.day} was your biggest day at ${formatMoney(peak.amount)}.`]
        : []),
    ],
  });

  if (topCategories.length > 0) {
    const top = topCategories[0];
    const share = spending.total > 0 ? Math.round((top.amount / spending.total) * 100) : 0;
    slides.push({
      key: "categories",
      label: "Where it went",
      headline: `${top.name} led your spending`,
      visual: <CategoriesVisual categories={topCategories} />,
      body: [`${top.name} made up ${share}% of everything you spent this week.`],
    });
  }

  const net = income.total - spending.total;
  slides.push({
    key: "income",
    label: "Income",
    headline:
      income.total > 0
        ? `${formatMoney(income.total)} came in this week`
        : "No income landed this week",
    visual: <IncomeVisual income={income.total} spent={spending.total} />,
    body: [
      net >= 0
        ? `You kept ${formatMoney(net)} more than you spent.`
        : `You spent ${formatMoney(-net)} more than came in.`,
    ],
  });

  if (biggest) {
    slides.push({
      key: "biggest",
      label: "Biggest purchase",
      headline: `${biggest.description} was your biggest purchase`,
      visual: <BiggestVisual biggest={biggest} />,
      body: [
        `It was one of ${data.transactionCount} transaction${data.transactionCount === 1 ? "" : "s"} logged this week.`,
      ],
    });
  }

  return slides;
}

function NetWorthVisual({ end, pct, points }: { end: number; pct: number; points: number[] }) {
  return (
    <>
      <p className="card-label text-text-faint">Net worth</p>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="tabular text-[28px] leading-none font-semibold text-text">
          {formatMoney(end)}
        </span>
        <span
          className={`tabular text-sm ${pct > 0 ? "text-positive" : pct < 0 ? "text-negative" : "text-text-muted"}`}
        >
          {pct >= 0 ? "+" : ""}
          {pct.toFixed(2)}%
        </span>
      </div>
      <MiniArea values={points} />
    </>
  );
}

function MiniArea({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => ({
    x: (i / (values.length - 1)) * 100,
    y: 34 - ((v - min) / range) * 28,
  }));
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <div className="relative mt-5 h-28">
      <svg
        viewBox="0 0 100 40"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="recap-net-worth-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.25} />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={`${line} L100,40 L0,40 Z`} fill="url(#recap-net-worth-fill)" />
        <path d={line} fill="none" stroke="var(--accent)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
      <span
        className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent ring-4 ring-surface"
        style={{ left: `${last.x}%`, top: `${(last.y / 40) * 100}%` }}
      />
    </div>
  );
}

function SpendingVisual({
  total,
  byDay,
}: {
  total: number;
  byDay: RecapData["spending"]["byDay"];
}) {
  const max = Math.max(0, ...byDay.map((d) => d.amount));
  const peakIndex = max > 0 ? byDay.findIndex((d) => d.amount === max) : -1;
  return (
    <>
      <p className="card-label text-text-faint">Spent</p>
      <p className="tabular mt-3 text-[28px] leading-none font-semibold text-text">
        {formatMoney(total)}
      </p>
      <div className="mt-6 flex h-28 items-end gap-2">
        {byDay.map((d, i) => (
          <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
            <div
              className="animate-bar-grow w-full max-w-7 rounded-md"
              style={{
                height: `${max > 0 ? Math.max(4, (d.amount / max) * 80) : 4}%`,
                backgroundColor: i === peakIndex ? "var(--accent)" : "var(--neutral-track)",
                animationDelay: `${i * 50}ms`,
              }}
            />
            <span className="text-[11px] text-text-faint">{d.letter}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function CategoriesVisual({ categories }: { categories: RecapData["topCategories"] }) {
  const max = categories[0]?.amount || 1;
  return (
    <>
      <p className="card-label text-text-faint">Top categories</p>
      <ul className="mt-4 space-y-4">
        {categories.map((c, i) => (
          <li key={c.name}>
            <div className="flex items-center gap-3 text-sm">
              <CategoryIcon name={c.name} icon={c.icon} size={16} className="text-text-muted" />
              <span className="min-w-0 flex-1 truncate font-medium text-text">{c.name}</span>
              <span className="tabular text-text">{formatMoney(c.amount)}</span>
            </div>
            <div
              className="mt-2 h-1.5 overflow-hidden rounded-full"
              style={{ backgroundColor: "var(--neutral-track)" }}
            >
              <div
                className="animate-bar-grow-x h-full rounded-full"
                style={{
                  width: `${(c.amount / max) * 100}%`,
                  backgroundColor: "var(--accent)",
                  animationDelay: `${i * 12}ms`,
                }}
              />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function IncomeVisual({ income, spent }: { income: number; spent: number }) {
  const max = Math.max(income, spent, 1);
  const net = income - spent;
  const rows = [
    { label: "Came in", amount: income, color: "var(--accent)" },
    { label: "Went out", amount: spent, color: "var(--text-faint)" },
  ];
  return (
    <>
      <p className="card-label text-text-faint">In vs. out</p>
      <div className="mt-4 space-y-4">
        {rows.map((r, i) => (
          <div key={r.label}>
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">{r.label}</span>
              <span className="tabular font-medium text-text">{formatMoney(r.amount)}</span>
            </div>
            <div
              className="mt-2 h-2.5 overflow-hidden rounded-full"
              style={{ backgroundColor: "var(--neutral-track)" }}
            >
              <div
                className="animate-bar-grow-x h-full rounded-full"
                style={{
                  width: `${(r.amount / max) * 100}%`,
                  backgroundColor: r.color,
                  animationDelay: `${i * 80}ms`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 flex justify-between border-t border-border pt-4 text-sm">
        <span className="text-text-muted">Net</span>
        <span className={`tabular font-semibold ${net >= 0 ? "text-positive" : "text-negative"}`}>
          {net >= 0 ? "+" : "-"}
          {formatMoney(Math.abs(net))}
        </span>
      </div>
    </>
  );
}

function BiggestVisual({ biggest }: { biggest: NonNullable<RecapData["biggest"]> }) {
  const colors = getLetterColors(biggest.description);
  return (
    <div className="flex items-center gap-3">
      <span
        className="flex size-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
        style={{ backgroundColor: colors.bg, color: colors.text }}
      >
        {biggest.description.trim()[0]?.toUpperCase() ?? "?"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-text">{biggest.description}</p>
        <p className="text-metadata">{formatDate(biggest.date)}</p>
      </div>
      <span className="tabular text-lg font-semibold text-text">{formatMoney(biggest.amount)}</span>
    </div>
  );
}
