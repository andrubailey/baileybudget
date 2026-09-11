"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { updateCategoryIcon } from "@/app/actions";
import { CATEGORY_ICON_KEYS, CATEGORY_ICON_LABELS, getCategoryIconKey } from "@/lib/category-icons";
import { CategoryIconGlyph } from "@/app/(app)/category-icon";
import { useToast } from "@/app/(app)/toast";

// Click-to-open swatch picker for a category's manual icon override — the
// keyword-guessed default in lib/category-icons.ts is a good starting point,
// but a guess from the name isn't always the icon someone actually wants.
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
        className="flex size-7 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-bg hover:text-text"
      >
        <CategoryIconGlyph iconKey={getCategoryIconKey(categoryName, current)} size={16} />
      </button>
      {open &&
        createPortal(
          <div
            ref={popoverRef}
            style={{ top: coords.top, left: coords.left }}
            className="fixed z-50 w-72 rounded-lg border border-border bg-surface p-3 shadow-modal"
          >
            <div className="grid grid-cols-8 gap-1">
              {CATEGORY_ICON_KEYS.map((key) => {
                const selected = getCategoryIconKey(categoryName, current) === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => apply(key)}
                    title={CATEGORY_ICON_LABELS[key]}
                    aria-label={CATEGORY_ICON_LABELS[key]}
                    aria-pressed={selected}
                    className={`flex size-7 items-center justify-center rounded-md transition-colors hover:bg-bg ${
                      selected ? "bg-accent-soft text-accent" : "text-text-muted"
                    }`}
                  >
                    <CategoryIconGlyph iconKey={key} size={16} />
                  </button>
                );
              })}
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
