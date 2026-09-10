"use client";

import { useState } from "react";
import { quickCreateCategory } from "@/app/actions";
import type { Category } from "@/lib/types";
import { FIELD_CLASS } from "@/lib/ui";

const NEW_OPTION_VALUE = "__new__";

// Inline "add a category" affordance for any category <select> in the app —
// replaces the old standalone category-management page. Picking "+ New
// category…" swaps the select for a name field; the created category is
// selected immediately without a page reload.
export function CategorySelect({
  categories,
  kind,
  value,
  onChange,
  name = "category_id",
  className = FIELD_CLASS,
  autoFocus = false,
  onBlur,
}: {
  categories: Category[];
  kind: "income" | "expense";
  value: string;
  onChange: (id: string) => void;
  name?: string;
  className?: string;
  // For inline table editing: focus on mount, and let the caller close
  // the editor when focus leaves (not while the "new category" field is
  // open, which manages its own focus).
  autoFocus?: boolean;
  onBlur?: () => void;
}) {
  const [localCategories, setLocalCategories] = useState<Category[]>([]);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = [...categories, ...localCategories].filter((c) => c.kind === kind);

  async function handleCreate() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    const result = await quickCreateCategory(trimmed, kind);
    setBusy(false);
    if (!result.ok || !result.id) {
      setError(result.error ?? "Couldn't create category.");
      return;
    }
    setLocalCategories((prev) => [
      ...prev,
      {
        id: result.id!,
        name: trimmed,
        kind,
        is_need: false,
        rollover: false,
        group_name: null,
        icon: null,
        is_active: true,
        created_at: new Date().toISOString(),
      },
    ]);
    onChange(result.id);
    setAdding(false);
    setNewName("");
  }

  if (adding) {
    return (
      <div className="space-y-1.5">
        <div className="flex gap-2">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleCreate();
              }
              if (e.key === "Escape") {
                setAdding(false);
                setNewName("");
              }
            }}
            placeholder="New category name"
            className={className}
          />
          <button
            type="button"
            onClick={handleCreate}
            disabled={busy || !newName.trim()}
            className="shrink-0 rounded-lg border border-border px-3 text-sm font-medium text-text transition-colors hover:bg-bg disabled:opacity-50"
          >
            {busy ? "…" : "Add"}
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(false);
              setNewName("");
              setError(null);
            }}
            className="shrink-0 rounded-lg border border-border px-3 text-sm font-medium text-text-muted transition-colors hover:bg-bg"
          >
            ✕
          </button>
        </div>
        {error && <p className="text-xs text-negative">{error}</p>}
      </div>
    );
  }

  return (
    <select
      name={name}
      value={value}
      autoFocus={autoFocus}
      onBlur={onBlur}
      onKeyDown={(e) => {
        if (e.key === "Escape") onBlur?.();
      }}
      onChange={(e) => {
        if (e.target.value === NEW_OPTION_VALUE) {
          setAdding(true);
          return;
        }
        onChange(e.target.value);
      }}
      className={className}
    >
      <option value="">—</option>
      {options.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
      <option value={NEW_OPTION_VALUE}>+ New category…</option>
    </select>
  );
}
