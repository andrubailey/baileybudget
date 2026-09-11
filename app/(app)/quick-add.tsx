"use client";

import { DatePicker } from "@/app/(app)/date-picker";

import { Dropdown } from "@/app/(app)/dropdown";
import { accountChoices } from "@/app/(app)/dropdown-options";

import { useEffect, useRef, useState } from "react";
import {
  checkDuplicateTransaction,
  createSplitTransaction,
  createTransaction,
  suggestCategory,
} from "@/app/actions";
import type { Account, Category } from "@/lib/types";
import { SubmitButton } from "@/app/(app)/submit-button";
import { useToast } from "@/app/(app)/toast";
import { CurrencyInput } from "@/app/(app)/currency-input";
import { CategorySelect } from "@/app/(app)/category-select";
import { formatMoney, formatDate } from "@/lib/format";
import { FIELD_CLASS as fieldClass } from "@/lib/ui";
import {
  announcePendingTransaction,
  withdrawPendingTransaction,
} from "@/app/(app)/pending-transactions";

type DuplicateMatch = { id: string; description: string; amount: number; txn_date: string };

const ICONS = {
  income: (
    <path d="M12 5v14M5 12h14" stroke="var(--positive)" strokeWidth={2} strokeLinecap="round" />
  ),
  expense: <path d="M5 12h14" stroke="var(--negative)" strokeWidth={2} strokeLinecap="round" />,
};

const CONFIG = {
  income: {
    bg: "var(--positive-bg)",
    title: "Add income",
    subtitle: "Log an income transaction",
  },
  expense: {
    bg: "var(--negative-bg)",
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
  const [accountId, setAccountId] = useState("");
  const [keepOpen, setKeepOpen] = useState(false);
  const [lastOpen, setLastOpen] = useState(open);
  const descriptionRef = useRef<HTMLInputElement>(null);
  const { bg, title, subtitle } = CONFIG[kind];
  const kindCategories = categories.filter((c) => c.kind === kind);
  const showToast = useToast();

  const lastAccountKey = `quick-add-last-account-${kind}`;
  const lastCategoryKey = `quick-add-last-category-${kind}`;

  // Debt accounts (credit cards, loans) store the opposite of what you'd
  // naturally expect: a new charge is recorded as "income" (it increases
  // what's owed) and a payment as "expense" (it reduces what's owed). Rather
  // than making the user remember that, the form always speaks in terms of
  // "charge"/"payment" for these accounts and flips the stored kind here.
  const selectedAccount = accounts.find((a) => a.id === accountId);
  const isDebtAccount = selectedAccount?.is_debt ?? false;
  const effectiveKind = isDebtAccount ? (kind === "expense" ? "income" : "expense") : kind;
  const actionLabel = isDebtAccount
    ? kind === "expense"
      ? "charge"
      : "payment"
    : kind === "expense"
      ? "expense"
      : "income";

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

  // Prefill from whatever was used last time this modal was opened for this
  // kind, so a recurring-ish purchase doesn't mean re-picking the same
  // account and category every single time. Adjusting state during render on
  // the open/close transition avoids the extra render pass an effect would
  // cause here (same pattern used for the mobile nav's route-change reset).
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      try {
        const savedAccount = localStorage.getItem(lastAccountKey);
        if (savedAccount && accounts.some((a) => a.id === savedAccount)) {
          setAccountId(savedAccount);
        }
        const savedCategory = localStorage.getItem(lastCategoryKey);
        if (savedCategory && kindCategories.some((c) => c.id === savedCategory)) {
          setCategoryId(savedCategory);
        }
      } catch {
        // ignore — localStorage unavailable
      }
    }
  }

  function rememberChoices() {
    try {
      if (accountId) localStorage.setItem(lastAccountKey, accountId);
      if (categoryId) localStorage.setItem(lastCategoryKey, categoryId);
    } catch {
      // ignore
    }
  }

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
    setAccountId("");
    setKeepOpen(false);
  }

  // For batch-entering a stack of receipts: keeps the modal open, keeps the
  // account/category (usually the same for a run of similar purchases), and
  // only clears the fields that change per-transaction.
  function resetForNextEntry() {
    setSplitRows([{ category_id: "", amount: "" }]);
    setDuplicates(null);
    setPendingFormData(null);
    descriptionRef.current?.form?.reset();
    descriptionRef.current?.focus();
  }

  async function submitFormData(formData: FormData) {
    // Show the row immediately; the server's revalidated list replaces it.
    const draftAmount = split
      ? splitRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
      : Number(formData.get("amount") ?? 0);
    const pendingId = announcePendingTransaction({
      kind: effectiveKind,
      description: String(formData.get("description") ?? "").trim() || title,
      amount: draftAmount,
      txn_date: String(formData.get("txn_date") ?? new Date().toISOString().slice(0, 10)),
      account_id: String(formData.get("account_id") ?? "") || null,
      to_account_id: null,
      category_id: split ? null : categoryId || null,
      period_id: periodId,
      notes: String(formData.get("notes") ?? "").trim() || null,
      pending_approval: formData.get("pending_approval") === "on",
    });
    const result = split
      ? await createSplitTransaction(
          formData,
          splitRows
            .filter((r) => r.category_id && r.amount)
            .map((r) => ({ category_id: r.category_id, amount: Number(r.amount) })),
        )
      : await createTransaction(formData);

    if (!result.ok) {
      withdrawPendingTransaction(pendingId);
      showToast(result.error ? `Couldn't save: ${result.error}` : "Couldn't save transaction");
      return;
    }

    rememberChoices();
    showToast(`${actionLabel[0].toUpperCase()}${actionLabel.slice(1)} logged`);
    if (keepOpen) {
      resetForNextEntry();
    } else {
      resetForm();
    }
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
          className="card-hover flex items-start gap-3 rounded-xl border border-border bg-surface p-5 text-left shadow-card"
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
          className="animate-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={resetForm}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            // dvh (not vh) so this actually shrinks when the on-screen
            // keyboard opens — vh stays pinned to the full, un-keyboarded
            // screen height on iOS Safari, which let this panel keep
            // centering/sizing itself against space that wasn't visible
            // anymore and pushed the Save button below the keyboard.
            className="animate-modal-panel max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-surface shadow-modal"
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="text-lg font-semibold text-text">{title}</h2>
              <button
                type="button"
                onClick={resetForm}
                className="-mr-2.5 flex size-11 shrink-0 items-center justify-center rounded-lg text-text-faint transition-colors hover:bg-bg hover:text-text"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <form action={handleSubmit} className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
              <input type="hidden" name="period_id" value={periodId} />
              <input type="hidden" name="kind" value={effectiveKind} />

              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-sm font-medium text-text">Description</label>
                <input
                  ref={descriptionRef}
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
                  <CurrencyInput
                    name="amount"
                    required
                    className={`${fieldClass} pr-3 pl-6 text-right`}
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text">Date</label>
                <DatePicker name="txn_date" required defaultValue={new Date().toISOString().slice(0, 10)} />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text">Account</label>
                <Dropdown
                  name="account_id"
                  value={accountId}
                  onChange={(next) => {
                    setAccountId(next);
                    if (next && accounts.find((a) => a.id === next)?.is_debt) {
                      setSplit(false);
                    }
                  }}
                  options={accountChoices(accounts, "—")}
                />
                {isDebtAccount && (
                  <p className="text-xs text-text-faint">
                    This is a debt account — this will be logged as a {actionLabel}.
                  </p>
                )}
              </div>

              {!split && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-text">Category</label>
                  <CategorySelect
                    categories={categories}
                    kind={kind}
                    value={categoryId}
                    onChange={(id) => {
                      setCategoryId(id);
                      setCategoryTouched(true);
                    }}
                    className={fieldClass}
                  />
                </div>
              )}

              {kind === "expense" && !isDebtAccount && (
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
                      <CategorySelect
                        categories={categories}
                        kind={kind}
                        value={row.category_id}
                        onChange={(id) => updateSplitRow(i, "category_id", id)}
                        className={fieldClass}
                      />
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
                          className="flex size-9 shrink-0 items-center justify-center rounded-lg text-text-faint transition-colors hover:bg-bg hover:text-negative"
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
                <input
                  name="notes"
                  placeholder="Split with Mike, reimbursed by work…"
                  maxLength={140}
                  className={fieldClass}
                />
              </div>

              {!split && (
                <div className="flex items-center gap-2 sm:col-span-2">
                  <input
                    type="checkbox"
                    id="make-recurring-toggle"
                    name="make_recurring"
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                  <label htmlFor="make-recurring-toggle" className="text-sm text-text-muted">
                    Make this recurring — automatically log it again every month
                  </label>
                </div>
              )}

              {duplicates && duplicates.length > 0 && (
                <div className="space-y-2 rounded-lg border border-caution bg-caution-bg p-3 sm:col-span-2">
                  <p className="text-sm font-medium text-caution-strong">
                    This looks like it might already be logged:
                  </p>
                  <ul className="space-y-1 text-sm text-caution-strong">
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
                      className="rounded-md border border-caution px-3 py-1.5 text-xs font-semibold text-caution-strong transition-colors hover:bg-caution-bg"
                    >
                      Add anyway
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDuplicates(null);
                        setPendingFormData(null);
                      }}
                      className="rounded-md px-3 py-1.5 text-xs font-medium text-caution-strong transition-colors hover:bg-caution-bg"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 sm:col-span-2">
                <input
                  type="checkbox"
                  id="keep-open-toggle"
                  checked={keepOpen}
                  onChange={(e) => setKeepOpen(e.target.checked)}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                <label htmlFor="keep-open-toggle" className="text-sm text-text-muted">
                  Keep open to add another
                </label>
              </div>

              {/* Sticky, not just the last grid item — stays reachable at
                  the bottom of the scrollable panel instead of scrolling
                  away under the keyboard along with the rest of the form. */}
              <div className="sticky bottom-0 -mx-5 -mb-5 flex items-center gap-3 border-t border-border bg-surface px-5 py-4 sm:col-span-2">
                <SubmitButton pendingText="Saving…">
                  Add {actionLabel}
                </SubmitButton>
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-text-muted transition-colors hover:bg-bg"
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
