"use client";

import { Dropdown } from "@/app/(app)/dropdown";
import { kindChoices } from "@/app/(app)/dropdown-options";

import { useEffect, useState } from "react";
import { quickCreateCategory } from "@/app/actions";
import type { Category } from "@/lib/types";
import { FIELD_CLASS } from "@/lib/ui";
import { useToast } from "@/app/(app)/toast";
import { CategoryIconGlyph } from "@/app/(app)/category-icon";
import {
  CATEGORY_ICON_KEYS,
  CATEGORY_ICON_LABELS,
  getCategoryIconKey,
  type CategoryIconKey,
} from "@/lib/category-icons";

const INITIAL_ICONS = 18;

export function NewCategoryDrawer({
  existing,
  onClose,
}: {
  existing: Category[];
  onClose: () => void;
}) {
  const [closing, setClosing] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"expense" | "income">("expense");
  // Follows a guess from the name as it's typed, until an icon is picked.
  const [pickedIcon, setPickedIcon] = useState<CategoryIconKey | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const showToast = useToast();

  function close() {
    setClosing(true);
    setTimeout(onClose, 150);
  }
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trimmed = name.trim();
  const icon = pickedIcon ?? getCategoryIconKey(trimmed);
  const duplicate = existing.some((c) => c.kind === kind && c.name.toLowerCase() === trimmed.toLowerCase());
  const canCreate = trimmed.length > 0 && !duplicate && !busy;

  async function create() {
    if (!canCreate) return;
    setBusy(true);
    setError(null);
    const result = await quickCreateCategory(trimmed, kind, icon);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Couldn't create category.");
      return;
    }
    showToast(`${trimmed} added`);
    close();
  }

  const iconIsHidden = CATEGORY_ICON_KEYS.indexOf(icon) >= INITIAL_ICONS;
  const visibleIcons = showAll || iconIsHidden ? CATEGORY_ICON_KEYS : CATEGORY_ICON_KEYS.slice(0, INITIAL_ICONS);

  return (
    <div
      className={`fixed inset-0 z-[110] flex justify-end bg-black/40 ${closing ? "animate-modal-backdrop-out" : "animate-modal-backdrop"}`}
      onClick={close}
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="New category"
        className={`flex h-full w-full max-w-md flex-col border-l border-border bg-surface shadow-modal ${
          closing ? "animate-drawer-out" : "animate-drawer-in"
        }`}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <p className="text-section-label">New category</p>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="-mr-1.5 flex size-9 items-center justify-center rounded-lg text-text-faint transition-colors hover:bg-bg hover:text-text"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") create();
            }}
            placeholder="Category name"
            className={FIELD_CLASS}
          />
          {duplicate && <p className="text-xs text-negative">A {kind} category with that name already exists.</p>}

          <label className="block">
            <span className="text-metadata block">Type</span>
            <Dropdown
              className="mt-1"
              value={kind}
              onChange={(next) => setKind(next as "expense" | "income")}
              options={kindChoices()}
            />
          </label>

          <div className="card-flush">
            <p className="border-b border-border px-4 py-3 text-sm font-medium text-text">Select icon</p>
            <div className="grid grid-cols-6 gap-2 p-4 sm:grid-cols-9">
              {visibleIcons.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPickedIcon(key)}
                  title={CATEGORY_ICON_LABELS[key]}
                  aria-label={CATEGORY_ICON_LABELS[key]}
                  aria-pressed={icon === key}
                  className={`flex aspect-square items-center justify-center rounded-full transition-colors ${
                    icon === key
                      ? "bg-accent-soft text-accent ring-2 ring-accent"
                      : "bg-bg text-text-muted hover:bg-border hover:text-text"
                  }`}
                >
                  <CategoryIconGlyph iconKey={key} size={18} />
                </button>
              ))}
            </div>
            {!showAll && !iconIsHidden && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="block w-full border-t border-border py-2.5 text-center text-sm text-text underline underline-offset-2 hover:text-accent"
              >
                Show more icons
              </button>
            )}
          </div>

          <p className="text-metadata">
            The category&apos;s color is assigned automatically and stays the same everywhere it appears.
          </p>
          {error && <p className="text-xs text-negative">{error}</p>}
        </div>

        <div className="flex justify-end border-t border-border px-5 py-4">
          <button
            type="button"
            onClick={create}
            disabled={!canCreate}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {busy ? "Creating…" : "Create category"}
          </button>
        </div>
      </aside>
    </div>
  );
}
