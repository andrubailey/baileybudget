"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// The app's date field, replacing the browser's native <input type="date">.
// Same trigger styles as Dropdown, so a date sits naturally next to an
// account or category picker; the calendar opens in a floating panel with
// the same chrome as the dropdown menu.
//
// Values are "YYYY-MM-DD" strings, exactly what the native input produced,
// and `name` submits them through a hidden field — server actions reading
// formData.get("txn_date") are unchanged. All date math is done in UTC on
// those strings so a day never shifts with the viewer's timezone.

export type DatePickerVariant = "field" | "panel" | "compact" | "pill";

const TRIGGER: Record<DatePickerVariant, string> = {
  field:
    "w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-base sm:py-2 sm:text-sm text-text focus-visible:border-accent data-[open=true]:border-accent",
  panel: "mt-0.5 w-full bg-transparent p-0 text-sm text-text",
  compact:
    "rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-text focus-visible:border-accent data-[open=true]:border-accent",
  // Toolbar-style, next to a pill Dropdown (the custom date range).
  pill:
    "rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text focus-visible:border-accent data-[open=true]:border-accent",
};

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const DAY_MS = 86_400_000;

function toIso(d: Date) {
  return d.toISOString().slice(0, 10);
}
function parseIso(iso: string | undefined | null): Date | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}
function todayIso() {
  const now = new Date();
  // The viewer's own calendar day, expressed as a UTC-midnight date.
  return toIso(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
}
function addDays(iso: string, days: number) {
  return toIso(new Date(parseIso(iso)!.getTime() + days * DAY_MS));
}
function addMonths(iso: string, months: number) {
  const d = parseIso(iso)!;
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), lastDay));
  return toIso(target);
}
function formatDisplay(iso: string) {
  return parseIso(iso)!.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function DatePicker({
  value: controlledValue,
  defaultValue,
  onChange,
  name,
  placeholder = "Select date",
  required,
  disabled,
  min,
  max,
  variant = "field",
  className = "",
  id,
  "aria-label": ariaLabel,
}: {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  name?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  // "YYYY-MM-DD" bounds; days outside them can't be picked.
  min?: string;
  max?: string;
  variant?: DatePickerVariant;
  className?: string;
  id?: string;
  "aria-label"?: string;
}) {
  const [uncontrolled, setUncontrolled] = useState(defaultValue ?? "");
  const isControlled = controlledValue !== undefined;
  const value = isControlled ? controlledValue : uncontrolled;

  const [open, setOpen] = useState(false);
  // The day keyboard focus is on; also decides which month is shown.
  const [focusIso, setFocusIso] = useState(() => (parseIso(value) ? value : todayIso()));
  const [coords, setCoords] = useState<{ top: number; left: number; above: boolean } | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const isDisabledDay = useCallback(
    (iso: string) => (!!min && iso < min) || (!!max && iso > max),
    [min, max],
  );

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const panelHeight = 360;
    const panelWidth = 288;
    const spaceBelow = window.innerHeight - rect.bottom;
    const above = spaceBelow < panelHeight + 12 && rect.top > spaceBelow;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - panelWidth - 8));
    setCoords({ top: above ? rect.top - 6 : rect.bottom + 6, left, above });
  }, []);

  function openPanel() {
    if (disabled) return;
    place();
    setFocusIso(parseIso(value) ? value : todayIso());
    setOpen(true);
  }

  function closePanel(refocus = true) {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }

  function commit(next: string) {
    if (next && isDisabledDay(next)) return;
    if (!isControlled) setUncontrolled(next);
    onChange?.(next);
    closePanel();
  }

  useLayoutEffect(() => {
    if (!open) return;
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const target = e.target as Node;
      if (!panelRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Move real focus onto the focused day so screen readers follow along.
  useEffect(() => {
    if (!open) return;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-iso="${focusIso}"]`)?.focus();
  }, [open, focusIso]);

  function onGridKeyDown(e: React.KeyboardEvent) {
    const moves: Record<string, () => string> = {
      ArrowLeft: () => addDays(focusIso, -1),
      ArrowRight: () => addDays(focusIso, 1),
      ArrowUp: () => addDays(focusIso, -7),
      ArrowDown: () => addDays(focusIso, 7),
      PageUp: () => addMonths(focusIso, e.shiftKey ? -12 : -1),
      PageDown: () => addMonths(focusIso, e.shiftKey ? 12 : 1),
      Home: () => addDays(focusIso, -parseIso(focusIso)!.getUTCDay()),
      End: () => addDays(focusIso, 6 - parseIso(focusIso)!.getUTCDay()),
    };
    if (moves[e.key]) {
      e.preventDefault();
      setFocusIso(moves[e.key]());
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      commit(focusIso);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closePanel();
    } else if (e.key === "Tab") {
      closePanel(false);
    }
  }

  // Six-week grid starting on the Sunday on or before the 1st.
  const focusDate = parseIso(focusIso)!;
  const monthStart = new Date(Date.UTC(focusDate.getUTCFullYear(), focusDate.getUTCMonth(), 1));
  const gridStart = new Date(monthStart.getTime() - monthStart.getUTCDay() * DAY_MS);
  const days = Array.from({ length: 42 }, (_, i) => toIso(new Date(gridStart.getTime() + i * DAY_MS)));
  const monthLabel = monthStart.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const today = todayIso();
  const hasValue = !!parseIso(value);

  return (
    <div className={`relative ${variant === "compact" || variant === "pill" ? "inline-block" : "w-full"} ${className}`}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        data-open={open}
        disabled={disabled}
        onClick={() => (open ? closePanel() : openPanel())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openPanel();
          }
        }}
        className={`flex w-full items-center justify-between gap-2 text-left outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${TRIGGER[variant]}`}
      >
        <span className={`truncate ${hasValue ? "" : "text-text-faint"}`}>
          {hasValue ? formatDisplay(value) : placeholder}
        </span>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0 text-text-faint">
          <path
            d="M4 8h16M8 3v3m8-3v3M6.8 20h10.4c1.12 0 1.68 0 2.108-.218a2 2 0 0 0 .874-.874C20.4 18.48 20.4 17.92 20.4 16.8V8.2c0-1.12 0-1.68-.218-2.108a2 2 0 0 0-.874-.874C18.88 5 18.32 5 17.2 5H6.8c-1.12 0-1.68 0-2.108.218a2 2 0 0 0-.874.874C3.6 6.52 3.6 7.08 3.6 8.2v8.6c0 1.12 0 1.68.218 2.108a2 2 0 0 0 .874.874C5.12 20 5.68 20 6.8 20Z"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {name && <input type="hidden" name={name} value={value} />}
      {required && (
        <input
          tabIndex={-1}
          aria-hidden="true"
          required
          value={value}
          onChange={() => {}}
          onFocus={() => triggerRef.current?.focus()}
          className="pointer-events-none absolute bottom-0 left-1/2 h-px w-px opacity-0"
        />
      )}

      {open &&
        coords &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Choose date"
            style={{ top: coords.top, left: coords.left, transform: coords.above ? "translateY(-100%)" : undefined }}
            className="animate-modal-panel fixed z-[200] w-72 rounded-xl border border-border bg-surface p-3 shadow-modal"
          >
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setFocusIso(addMonths(focusIso, -1))}
                aria-label="Previous month"
                className="flex size-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-bg hover:text-text"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <p className="text-sm font-semibold text-text" aria-live="polite">
                {monthLabel}
              </p>
              <button
                type="button"
                onClick={() => setFocusIso(addMonths(focusIso, 1))}
                aria-label="Next month"
                className="flex size-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-bg hover:text-text"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>

            <div className="grid grid-cols-7 text-center text-[11px] font-medium text-text-faint">
              {WEEKDAYS.map((d) => (
                <span key={d} className="py-1">
                  {d}
                </span>
              ))}
            </div>

            <div ref={gridRef} role="grid" onKeyDown={onGridKeyDown} className="mt-1 grid grid-cols-7 gap-y-0.5">
              {days.map((iso) => {
                const inMonth = iso.slice(0, 7) === focusIso.slice(0, 7);
                const selected = iso === value;
                const isToday = iso === today;
                const off = isDisabledDay(iso);
                return (
                  <button
                    key={iso}
                    type="button"
                    role="gridcell"
                    data-iso={iso}
                    tabIndex={iso === focusIso ? 0 : -1}
                    aria-selected={selected}
                    aria-current={isToday ? "date" : undefined}
                    aria-label={formatDisplay(iso)}
                    disabled={off}
                    onClick={() => commit(iso)}
                    className={`tabular mx-auto flex size-9 items-center justify-center rounded-full text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent-bright disabled:cursor-not-allowed disabled:opacity-30 ${
                      selected
                        ? "bg-accent font-semibold text-white"
                        : isToday
                          ? "font-semibold text-accent ring-1 ring-accent-border hover:bg-bg"
                          : inMonth
                            ? "text-text hover:bg-bg"
                            : "text-text-faint/60 hover:bg-bg"
                    }`}
                  >
                    {Number(iso.slice(8, 10))}
                  </button>
                );
              })}
            </div>

            <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
              <button
                type="button"
                onClick={() => commit(today)}
                disabled={isDisabledDay(today)}
                className="rounded-md px-2 py-1 text-xs font-semibold text-accent transition-colors hover:bg-accent-soft disabled:opacity-40"
              >
                Today
              </button>
              {!required && hasValue && (
                <button
                  type="button"
                  onClick={() => commit("")}
                  className="rounded-md px-2 py-1 text-xs font-medium text-text-faint transition-colors hover:bg-bg hover:text-text"
                >
                  Clear
                </button>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
