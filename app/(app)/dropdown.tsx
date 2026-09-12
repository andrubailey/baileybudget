"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

// The app's one dropdown, replacing the browser's native <select> everywhere.
// A native select opens an OS-styled menu that ignores the app's type,
// colors and radius; this keeps the look consistent and adds type-to-search
// for long lists.
//
// Drop-in for forms: pass `name` and the chosen value is submitted through
// a hidden field, so server actions reading `formData.get(name)` don't
// change. `required` is enforced through a visually hidden input the
// browser can validate and anchor its "please select" bubble to.

export type DropdownOption = {
  value: string;
  label: string;
  // Secondary line under the label, e.g. an account's type.
  description?: string;
  // "accent" styles an action-like option ("+ New category…").
  tone?: "default" | "accent";
  // Leading visual — a bank logo, a category icon, a status dot. Shown in
  // the menu row and, for the selected option, on the trigger too. Keep it
  // around 20px so rows line up.
  icon?: React.ReactNode;
  disabled?: boolean;
};

export type DropdownVariant = "field" | "panel" | "compact" | "pill";

const TRIGGER: Record<DropdownVariant, string> = {
  // Standalone form field — matches FIELD_CLASS.
  field:
    "w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-base sm:py-2 sm:text-sm text-text focus-visible:border-accent data-[open=true]:border-accent",
  // Inside a PanelField box, which draws the border itself.
  panel: "mt-0.5 w-full bg-transparent p-0 text-sm text-text",
  // Dense contexts: table toolbars, filter popovers, inline settings.
  compact:
    "rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-text focus-visible:border-accent data-[open=true]:border-accent",
  // Page-level switchers (month, date range).
  pill:
    "rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-text-muted hover:text-text focus-visible:border-accent data-[open=true]:border-accent data-[open=true]:text-text",
};

const SEARCH_THRESHOLD = 9;

export function Dropdown({
  options,
  value: controlledValue,
  defaultValue,
  onChange,
  name,
  placeholder = "Select…",
  required,
  disabled,
  variant = "field",
  searchable,
  className = "",
  menuClassName = "",
  id,
  autoFocus,
  onBlur,
  "aria-label": ariaLabel,
}: {
  options: DropdownOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  name?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  variant?: DropdownVariant;
  // Defaults to on for lists longer than SEARCH_THRESHOLD.
  searchable?: boolean;
  // Applied to the wrapper — use for width (e.g. "w-full sm:w-auto").
  className?: string;
  menuClassName?: string;
  id?: string;
  autoFocus?: boolean;
  onBlur?: () => void;
  "aria-label"?: string;
}) {
  const [uncontrolled, setUncontrolled] = useState(defaultValue ?? "");
  const isControlled = controlledValue !== undefined;
  const value = isControlled ? controlledValue : uncontrolled;

  const [open, setOpen] = useState(false);
  // Keeps the menu mounted (and playing the reverse animation) for one
  // more beat after `open` goes false — without this it just vanished
  // instantly, since a conditionally-rendered element gives CSS nothing
  // left to animate once it's gone.
  const [closing, setClosing] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number; above: boolean } | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const typeahead = useRef({ text: "", at: 0 });
  const reactId = useId();
  const listboxId = `${id ?? `dd${reactId.replace(/:/g, "")}`}-list`;

  const selected = options.find((o) => o.value === value);
  // If any option has an icon, iconless ones get an empty slot so every
  // label in the menu starts at the same x position.
  const anyIcons = options.some((o) => o.icon);
  const showSearch = searchable ?? options.length > SEARCH_THRESHOLD;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q) || o.description?.toLowerCase().includes(q));
  }, [options, query]);

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const menuHeight = Math.min(320, 48 + options.length * 36);
    const spaceBelow = window.innerHeight - rect.bottom;
    const above = spaceBelow < menuHeight + 12 && rect.top > spaceBelow;
    const width = Math.max(rect.width, 180);
    const left = Math.min(rect.left, window.innerWidth - width - 8);
    setCoords({ top: above ? rect.top - 6 : rect.bottom + 6, left: Math.max(8, left), width, above });
  }, [options.length]);

  function openMenu() {
    if (disabled) return;
    place();
    setQuery("");
    const idx = options.findIndex((o) => o.value === value && !o.disabled);
    setActiveIndex(idx >= 0 ? idx : options.findIndex((o) => !o.disabled));
    setOpen(true);
  }

  function closeMenu(refocus = true) {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
    setClosing(true);
    setTimeout(() => setClosing(false), 150);
  }

  function choose(option: DropdownOption) {
    if (option.disabled) return;
    if (!isControlled) setUncontrolled(option.value);
    onChange?.(option.value);
    closeMenu();
  }

  // Keep the menu attached to its trigger while the page or a panel scrolls.
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
    (showSearch ? searchRef.current : listRef.current)?.focus();
    function onDown(e: MouseEvent) {
      const target = e.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) closeMenu(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, showSearch]);

  // Keep the highlighted option in view while arrowing through a long list.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  function move(delta: number) {
    if (filtered.length === 0) return;
    let i = activeIndex;
    for (let step = 0; step < filtered.length; step++) {
      i = (i + delta + filtered.length) % filtered.length;
      if (!filtered[i].disabled) break;
    }
    setActiveIndex(i);
  }

  function onMenuKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        move(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        move(-1);
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(filtered.findIndex((o) => !o.disabled));
        break;
      case "End":
        e.preventDefault();
        for (let i = filtered.length - 1; i >= 0; i--) {
          if (!filtered[i].disabled) {
            setActiveIndex(i);
            break;
          }
        }
        break;
      case "Enter":
        e.preventDefault();
        if (filtered[activeIndex]) choose(filtered[activeIndex]);
        break;
      case " ":
        if (!showSearch) {
          e.preventDefault();
          if (filtered[activeIndex]) choose(filtered[activeIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        closeMenu();
        break;
      case "Tab":
        closeMenu(false);
        break;
      default:
        // Type-ahead: jump to the next option starting with what was typed.
        if (!showSearch && e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
          const now = e.timeStamp;
          const t = typeahead.current;
          t.text = now - t.at > 600 ? e.key.toLowerCase() : t.text + e.key.toLowerCase();
          t.at = now;
          const match = filtered.findIndex((o) => !o.disabled && o.label.toLowerCase().startsWith(t.text));
          if (match >= 0) setActiveIndex(match);
        }
    }
  }

  function onTriggerKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openMenu();
    }
    if (e.key === "Escape") onBlur?.();
  }

  return (
    <div className={`relative ${variant === "field" || variant === "panel" ? "w-full" : "inline-block"} ${className}`}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel}
        data-open={open}
        disabled={disabled}
        autoFocus={autoFocus}
        onClick={() => (open ? closeMenu() : openMenu())}
        onKeyDown={onTriggerKeyDown}
        onBlur={() => {
          if (!open) onBlur?.();
        }}
        className={`flex w-full items-center justify-between gap-2 text-left outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${TRIGGER[variant]}`}
      >
        <span className={`flex min-w-0 items-center gap-2 ${selected ? "" : "text-text-faint"}`}>
          {selected?.icon && (
            <span className="flex size-5 shrink-0 items-center justify-center" aria-hidden="true">
              {selected.icon}
            </span>
          )}
          <span className="truncate">{selected ? selected.label : placeholder}</span>
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className={`shrink-0 text-text-faint transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        >
          <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
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

      {(open || closing) &&
        coords &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              top: coords.top,
              left: coords.left,
              width: coords.width,
              transform: coords.above ? "translateY(-100%)" : undefined,
            }}
            className={`fixed z-[200] overflow-hidden rounded-xl border border-border bg-surface shadow-modal ${
              closing ? "animate-modal-panel-out pointer-events-none" : "animate-modal-panel"
            } ${menuClassName}`}
            onKeyDown={onMenuKeyDown}
          >
            {showSearch && (
              <div className="border-b border-border p-1.5">
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActiveIndex(0);
                  }}
                  placeholder="Search…"
                  aria-controls={listboxId}
                  className="w-full rounded-md bg-bg px-2.5 py-1.5 text-sm text-text outline-none placeholder:text-text-faint"
                />
              </div>
            )}
            <div
              ref={listRef}
              id={listboxId}
              role="listbox"
              tabIndex={-1}
              aria-activedescendant={activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
              className="max-h-72 overflow-y-auto p-1 outline-none"
            >
              {filtered.length === 0 && (
                <p className="px-2.5 py-2 text-sm text-text-faint">No matches</p>
              )}
              {filtered.map((o, i) => {
                const isSelected = o.value === value;
                const isActive = i === activeIndex;
                return (
                  <div
                    key={`${o.value}-${i}`}
                    id={`${listboxId}-${i}`}
                    data-index={i}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={o.disabled}
                    onMouseEnter={() => !o.disabled && setActiveIndex(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(o)}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                      o.disabled ? "cursor-not-allowed opacity-40" : ""
                    } ${isActive ? "bg-bg" : ""} ${
                      o.tone === "accent" ? "font-medium text-accent" : isSelected ? "font-medium text-text" : "text-text-2"
                    }`}
                  >
                    {(o.icon || anyIcons) && (
                      <span className="flex size-5 shrink-0 items-center justify-center" aria-hidden="true">
                        {o.icon}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{o.label}</span>
                      {o.description && <span className="text-metadata block truncate">{o.description}</span>}
                    </span>
                    {isSelected && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0 text-accent">
                        <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                );
              })}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
