"use client";

import { useEffect, useState } from "react";
import {
  checkDuplicateTransaction,
  createSplitTransaction,
  createTransaction,
  suggestCategory,
} from "@/app/actions";
import type { Account, Category } from "@/lib/types";
import { SubmitButton } from "@/app/(app)/submit-button";
import { useToast } from "@/app/(app)/toast";
import { formatMoney, formatDate } from "@/lib/format";

type DuplicateMatch = { id: string; description: string; amount: number; txn_date: string };

// text-base (16px) on mobile prevents iOS Safari's auto-zoom-on-focus; drops
// back to text-sm at sm: since desktop doesn't have that problem.
const fieldClass =
  "w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-base sm:text-sm sm:py-2 text-text outline-none transition-colors focus:border-accent";

const ICONS = {
  income: (
    <path d="M12 5v14M5 12h14" stroke="#17b26a" strokeWidth={2} strokeLinecap="round" />
  ),
  expense: <path d="M5 12h14" stroke="#f04438" strokeWidth={2} strokeLinecap="round" />,
};

const CONFIG = {
  income: {
    bg: "#dcfae6",
    title: "Add income",
    subtitle: "Log an income transaction",
  },
  expense: {
    bg: "#fee4e2",
    title: "Add expense",
    subtitle: "Log an expense transaction",
  },
} as const;

export function QuickAddButton({
  kind,
  periodId,
  accounts,
  categories,
  renderTrigger,
}: {
  kind: "income" | "expense";
  periodId: string;
  accounts: Account[];
  categories: Category[];
  // Lets a different UI (e.g. a mobile floating action button) open this
  // same modal instead of the default card trigger below.
  renderTrigger?: (open: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [split, setSplit] = useState(false);
  const [splitRows, setSplitRows] = useState([{ category_id: "", amount: "" }]);
  const [duplicates, setDuplicates] = useState<DuplicateMatch[] | null>(null);
  const [pendingFormData, setPendingFormData] = useState<FormData | null>(null);
  const { bg, title, subtitle } = CONFIG[kind];
  const kindCategories = categories.filter((c) => c.kind === kind);
  const showToast = useToast();

  // Global shortcut for the app's single most frequent action — logging a
  // transaction — so it doesn't always require finding and clicking the tile.
  const shortcutKey = kind === "expense" ? "e" : "i";
  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if (open || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const isTyping =
        !!target &&
        (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable);
      if (isTyping) return;
      if (e.key.toLowerCase() === shortcutKey) {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [open, shortcutKey]);

  async function handleDescriptionBlur(description: string) {
    if (kind !== "expense" || categoryTouched || !description.trim()) return;
    const suggestion = await suggestCategory(description);
    if (suggestion) setCategoryId(suggestion);
  }

  function resetForm() {
    setOpen(false);
    setSplit(false);
    setSplitRows([{ category_id: "", amount: "" }]);
    setCategoryId("");
    setCategoryTouched(false);
    setDuplicates(null);
    setPendingFormData(null);
  }

  async function submitFormData(formData: FormData) {
    if (split) {
      await createSplitTransaction(
        formData,
        splitRows
          .filter((r) => r.category_id && r.amount)
          .map((r) => ({ category_id: r.category_id, amount: Number(r.amount) })),
      );
    } else {
      await createTransaction(formData);
    }
    resetForm();
    showToast(kind === "income" ? "Income logged" : "Expense logged");
  }

  async function handleSubmit(formData: FormData) {
    const account_id = String(formData.get("account_id") ?? "");
    const txn_date = String(formData.get("txn_date") ?? "");
    const amount = split
      ? splitRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
      : Number(formData.get("amount") ?? 0);

    if (account_id && amount && txn_date) {
      const matches = await checkDuplicateTransaction(account_id, amount, txn_date);
      if (matches.length > 0) {
        setDuplicates(matches);
        setPendingFormData(formData);
        return;
      }
    }

    await submitFormData(formData);
  }

  async function confirmAnyway() {
    if (!pendingFormData) return;
    await submitFormData(pendingFormData);
  }

  function addSplitRow() {
    setSplitRows((rows) => [...rows, { category_id: "", amount: "" }]);
  }

  function updateSplitRow(index: number, field: "category_id" | "amount", value: string) {
    setSplitRows((rows) => rows.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  }

  function removeSplitRow(index: number) {
    setSplitRows((rows) => rows.filter((_, i) => i !== index));
  }

  const splitTotal = splitRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  return (
    <>
      {renderTrigger ? (
        renderTrigger(() => setOpen(true))
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-start gap-3 rounded-xl border border-border bg-surface p-5 text-left shadow-[0px_1px_1px_0px_rgba(16,24,40,0.05)] transition-shadow hover:shadow-md"
        >
          <span
            className="flex size-12 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: bg }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              {ICONS[kind]}
            </svg>
          </span>
          <div>
            <p className="flex items-center gap-1.5 text-base font-semibold text-text-2">
              {title}
              <kbd className="rounded border border-border bg-bg px-1.5 py-0.5 text-[11px] font-medium text-text-faint">
                {shortcutKey.toUpperCase()}
              </kbd>
            </p>
            <p className="text-sm text-text-muted">{subtitle}</p>
          </div>
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={resetForm}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-surface p-6 shadow-xl"
          >
            <div className="mb-4 flex items-start justify-between">
              <h2 className="text-lg font-semibold text-text">{title}</h2>
              <button
                type="button"
                onClick={resetForm}
                className="text-text-faint hover:text-text"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <form action={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <input type="hidden" name="period_id" value={periodId} />
              <input type="hidden" name="kind" value={kind} />

              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-sm font-medium text-text">Description</label>
                <input
                  name="description"
                  required
                  placeholder={kind === "income" ? "Paycheck" : "Whole Foods"}
                  autoFocus
                  onBlur={(e) => handleDescriptionBlur(e.target.value)}
                  className={fieldClass}
                />
              </div>

              {!split && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-text">Amount</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    name="amount"
                    required
                    className={fieldClass}
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text">Date</label>
                <input
                  type="date"
                  name="txn_date"
                  required
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  className={fieldClass}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text">Account</label>
                <select name="account_id" className={fieldClass}>
                  <option value="">—</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>

              {!split && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-text">Category</label>
                  <select
                    name="category_id"
                    value={categoryId}
                    onChange={(e) => {
                      setCategoryId(e.target.value);
                      setCategoryTouched(true);
                    }}
                    className={fieldClass}
                  >
                    <option value="">—</option>
                    {kindCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {kind === "expense" && (
                <div className="flex items-center gap-2 sm:col-span-2">
                  <input
                    type="checkbox"
                    id="split-toggle"
                    checked={split}
                    onChange={(e) => setSplit(e.target.checked)}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                  <label htmlFor="split-toggle" className="text-sm text-text">
                    Split across multiple categories
                  </label>
                </div>
              )}

              {split && (
                <div className="space-y-2 sm:col-span-2">
                  {splitRows.map((row, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <select
                        value={row.category_id}
                        onChange={(e) => updateSplitRow(i, "category_id", e.target.value)}
                        className={fieldClass}
                      >
                        <option value="">Category —</option>
                        {kindCategories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        placeholder="Amount"
                        value={row.amount}
                        onChange={(e) => updateSplitRow(i, "amount", e.target.value)}
                        className={`${fieldClass} max-w-[120px]`}
                      />
                      {splitRows.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeSplitRow(i)}
                          className="shrink-0 text-text-faint hover:text-[#f04438]"
                          aria-label="Remove split"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={addSplitRow}
                      className="text-sm font-medium text-accent hover:underline"
                    >
                      + Add category
                    </button>
                    <span className="tabular text-sm text-text-muted">Total: ${splitTotal.toFixed(2)}</span>
                  </div>
                </div>
              )}

              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-sm font-medium text-text">Notes (optional)</label>
                <input name="notes" placeholder="Split with Mike, reimbursed by work…" className={fieldClass} />
              </div>

              {duplicates && duplicates.length > 0 && (
                <div className="space-y-2 rounded-lg border border-[#f79009] bg-[#fffaeb] p-3 sm:col-span-2">
                  <p className="text-sm font-medium text-[#b54708]">
                    This looks like it might already be logged:
                  </p>
                  <ul className="space-y-1 text-sm text-[#b54708]">
                    {duplicates.map((d) => (
                      <li key={d.id}>
                        {d.description} — {formatMoney(d.amount)} on {formatDate(d.txn_date)}
                      </li>
                    ))}
                  </ul>
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={confirmAnyway}
                      className="rounded-md border border-[#f79009] px-3 py-1.5 text-xs font-semibold text-[#b54708] hover:bg-[#fef0c7]"
                    >
                      Add anyway
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDuplicates(null);
                        setPendingFormData(null);
                      }}
                      className="rounded-md px-3 py-1.5 text-xs font-medium text-[#b54708] hover:bg-[#fef0c7]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 sm:col-span-2">
                <SubmitButton pendingText="Saving…">
                  {kind === "income" ? "Add income" : "Add expense"}
                </SubmitButton>
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-text-muted hover:bg-bg"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
