"use client";

import { useState } from "react";
import { CsvImport } from "./csv-import";
import type { Account, Category } from "@/lib/types";

// The CSV importer used to live behind its own "Import" tab on this page —
// now that Trends and the Weekly Recap share one page, it's a modal instead
// so it doesn't need a whole page/tab of its own for something used rarely.
export function ImportDataButton({
  accounts,
  categories,
}: {
  accounts: Account[];
  categories: Category[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-text-muted transition-colors hover:bg-bg print:hidden"
      >
        Import data
      </button>

      {open && (
        <div
          className="animate-modal-backdrop fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="animate-modal-panel my-8 max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-surface p-6 shadow-modal"
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-text">Import data</h2>
                <p className="mt-0.5 text-sm text-text-muted">
                  Upload a CSV export from your bank to bulk-add transactions instead of entering them one by one.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="-mt-1 -mr-2.5 flex size-11 shrink-0 items-center justify-center rounded-lg text-text-faint hover:bg-bg hover:text-text"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <CsvImport accounts={accounts} categories={categories} />
          </div>
        </div>
      )}
    </>
  );
}
