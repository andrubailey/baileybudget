"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { updateCategoryIcon } from "@/app/actions";
import { getCategoryIcon } from "@/lib/category-icons";
import { useToast } from "@/app/(app)/toast";

// A broad-but-curated household-budget set, not the full emoji keyboard —
// picking a custom icon should be a quick scan, not a search.
const ICON_CHOICES = [
  "🛒", "🍽️", "☕", "🏠", "💡", "📶", "📱", "🚗",
  "🚌", "🛡️", "🩺", "🏋️", "💇", "🛍️", "🎬", "🔁",
  "✈️", "🎓", "🧸", "🐾", "🎁", "❤️", "💳", "🏦",
  "🧾", "💼", "🙂", "🏷️", "🎉", "📚", "🧴", "🧹",
  "🐶", "🎮", "🌱", "🚿", "🔧", "📺", "🎧", "🍺",
];

// Click-to-open swatch picker for a category's manual icon override — the
// keyword-guessed default in lib/category-icons.ts is a good starting point,
// but "Coffee" guessing ☕ isn't always the icon someone actually wants.
export function CategoryIconPicker({
  categoryId,
  categoryName,
  icon,
}: {
  categoryId: string;
  categoryName: string;
  icon: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(icon);
  const [custom, setCustom] = useState("");
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [, startTransition] = useTransition();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const showToast = useToast();

  function openPicker() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) setCoords({ top: rect.bottom + 4, left: rect.left });
    setOpen(true);
  }

  // The panel is portaled straight to <body> (position: fixed, viewport
  // coordinates from the button's rect) instead of living inside this
  // component's own DOM position — the category table it lives in clips
  // overflow for its rounded corners, which would otherwise cut the popover
  // off at the table's edge.
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        !buttonRef.current?.contains(target) &&
        !popoverRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function apply(next: string | null) {
    const previous = current;
    setCurrent(next);
    setOpen(false);
    startTransition(async () => {
      const result = await updateCategoryIcon(categoryId, next);
      if (!result.ok) {
        setCurrent(previous);
        showToast(result.error ? `Couldn't save: ${result.error}` : "Couldn't save icon");
      }
    });
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openPicker())}
        title="Change icon"
        className="flex size-6 shrink-0 items-center justify-center rounded-md text-base leading-none transition-colors hover:bg-bg"
      >
        {getCategoryIcon(categoryName, current)}
      </button>
      {open &&
        createPortal(
          <div
            ref={popoverRef}
            style={{ top: coords.top, left: coords.left }}
            className="fixed z-50 w-64 rounded-lg border border-border bg-surface p-3 shadow-modal"
          >
            <div className="grid grid-cols-8 gap-1">
              {ICON_CHOICES.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => apply(e)}
                  className={`flex size-7 items-center justify-center rounded-md text-base leading-none transition-colors hover:bg-bg ${
                    current === e ? "bg-accent-soft" : ""
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
            <div className="mt-2 flex gap-1.5 border-t border-border pt-2">
              <input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="Custom emoji"
                maxLength={4}
                className="min-w-0 flex-1 rounded-md border border-border bg-bg px-2 py-1 text-sm outline-none focus:border-accent"
              />
              <button
                type="button"
                onClick={() => {
                  const trimmed = custom.trim();
                  if (trimmed) apply(trimmed);
                  setCustom("");
                }}
                className="shrink-0 rounded-md border border-border px-2 py-1 text-xs font-medium text-text-muted transition-colors hover:bg-bg"
              >
                Use
              </button>
            </div>
            {current && (
              <button
                type="button"
                onClick={() => apply(null)}
                className="mt-2 w-full rounded-md px-2 py-1 text-xs font-medium text-text-faint transition-colors hover:bg-bg hover:text-text"
              >
                Reset to auto
              </button>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
