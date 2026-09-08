"use client";

import { deleteCategory } from "@/app/actions";

export function DeleteCategoryButton({ id, name }: { id: string; name: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        if (window.confirm(`Delete "${name}"? Its budget history will be removed too.`)) {
          deleteCategory(id);
        }
      }}
      className="text-xs text-text-faint hover:text-negative"
    >
      Delete
    </button>
  );
}
