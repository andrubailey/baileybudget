"use client";

import { DatePicker } from "@/app/(app)/date-picker";

import { Dropdown } from "@/app/(app)/dropdown";
import { accountChoices } from "@/app/(app)/dropdown-options";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  createRecurringFromTransaction,
  getHistoryForTransaction,
  toggleRecurringActive,
  updateTransaction,
} from "@/app/actions";
import { formatDate, formatMoney } from "@/lib/format";
import type { Account, Category, Transaction, TransactionHistoryEntry } from "@/lib/types";
import type { SplitDetail } from "@/lib/queries";
import { PANEL_FIELD_INPUT_CLASS } from "@/lib/ui";
import { useToast } from "@/app/(app)/toast";
import { CategorySelect } from "@/app/(app)/category-select";
import { CurrencyInput } from "@/app/(app)/currency-input";
import { Money } from "@/app/(app)/money";
import { PanelField } from "@/app/(app)/panel-field";
import { ToggleSwitch } from "@/app/(app)/toggle-switch";

// Shared "click a transaction to see/edit it" panel — the Transactions
// table and the Overview page's Recent Transactions list both open this
// same component. Autosaves on close: there's no Save button, closing the
// panel (backdrop, back arrow, Escape) writes whatever changed.
//
// A right-edge slide-over (see CategoryDetailPanel for the same pattern),
// not a centered/bottom-sheet modal: a back arrow instead of an ✕, the
// amount and category centered up top like a receipt, then the rest of the
// fields as boxed rows (PanelField) below.
export function TransactionDetailModal({
  transaction: t,
  accounts,
  categories,
  accountName,
  toAccountName,
  closing,
  onClose,
  splits,
  onSave,
  period,
}: {
  transaction: Transaction;
  accounts: Account[];
  categories: Category[];
  accountName: string;
  toAccountName: string | null;
  closing: boolean;
  onClose: () => void;
  // Called with the edited fields the moment the panel closes with real
  // changes, before the server save lands, so the list can show the edit
  // immediately instead of jumping when the refreshed data arrives.
  onSave?: (patch: Partial<Transaction>) => void;
  // A split parent stores category_id: null and its real breakdown in
  // transaction_splits — passing those rows switches this to a read-only
  // view instead of the normal editable form. The form's autosave-on-close
  // writes a single amount/category_id back to the parent row, which would
  // silently desync it from the splits it actually represents; real
  // split-editing is a bigger feature this isn't attempting yet.
  splits?: SplitDetail[];
  // Bounds the date field to the period this transaction is actually filed
  // under — without it, an edited date can silently drift outside the
  // period it's attributed to (it still counts toward that period's totals,
  // since those are keyed by period_id, but drops out of anything that
  // buckets by the date instead, like a trend chart). Optional because not
  // every caller has period data on hand; omitting it just means no bound.
  period?: { start_date: string; end_date: string } | null;
}) {
  const isSplitParent = t.kind !== "transfer" && !!splits && splits.length > 0;
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const showToast = useToast();

  // Every edit snapshots the transaction's before-state to
  // transaction_history, but nothing showed it anywhere — loaded on demand
  // (not on open) since most transactions have never been edited and this
  // panel opens often.
  const [history, setHistory] = useState<TransactionHistoryEntry[] | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  async function toggleHistory() {
    if (historyOpen) {
      setHistoryOpen(false);
      return;
    }
    setHistoryOpen(true);
    if (history !== null) return;
    setLoadingHistory(true);
    const rows = await getHistoryForTransaction(t.id);
    setLoadingHistory(false);
    setHistory(rows);
  }

  const [accountId, setAccountId] = useState(t.account_id ?? "");
  // Debt accounts store the opposite of what you'd expect (a charge is
  // "income", a payment is "expense"), so the initial display kind is
  // un-flipped from the stored value here and re-flipped back on submit.
  const initialIsDebtAccount =
    accounts.find((a) => a.id === t.account_id)?.is_debt ?? false;
  const [kind, setKind] = useState<"income" | "expense">(
    initialIsDebtAccount
      ? t.kind === "income"
        ? "expense"
        : "income"
      : t.kind === "income"
        ? "income"
        : "expense",
  );
  const isDebtAccount =
    accounts.find((a) => a.id === accountId)?.is_debt ?? false;
  const effectiveKind = isDebtAccount
    ? kind === "expense"
      ? "income"
      : "expense"
    : kind;
  const [categoryId, setCategoryId] = useState(t.category_id ?? "");
  const [description, setDescription] = useState(t.description);
  const wasRecurring = !!t.recurring_transaction_id;
  const [isRecurring, setIsRecurring] = useState(wasRecurring);
  const formRef = useRef<HTMLFormElement>(null);

  // Closing the panel — click outside, the back arrow, or Escape — plays the
  // exit animation immediately instead of waiting on the network. The save
  // (skipped for the transfer read-only view, or if a required field was
  // cleared) runs in the background afterward.
  function handleClose() {
    onClose();
    if (t.kind === "transfer" || isSplitParent) return;
    const form = formRef.current;
    if (!form || !form.reportValidity()) return;
    const formData = new FormData(form);
    formData.set("kind", effectiveKind);

    // Opening a transaction just to look at it used to save it on close
    // anyway — a history row, a cache wipe and a full page refresh every
    // single time, which is what made the list visibly reload. Only save
    // when something actually differs from what was loaded.
    const next = {
      kind: effectiveKind,
      description: String(formData.get("description") ?? "").trim(),
      amount: Number(formData.get("amount") ?? 0),
      txn_date: String(formData.get("txn_date") ?? ""),
      account_id: String(formData.get("account_id") ?? "") || null,
      category_id: String(formData.get("category_id") ?? "") || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
    };
    const changed =
      next.kind !== t.kind ||
      next.description !== t.description ||
      next.amount !== t.amount ||
      next.txn_date !== t.txn_date ||
      next.account_id !== t.account_id ||
      next.category_id !== t.category_id ||
      next.notes !== (t.notes ?? null);

    if (changed) {
      // Don't touch the list until the save actually lands — patching it
      // optimistically and only reconciling once fresh data arrives left a
      // window (permanent, if the save silently failed) where the row showed
      // an edit the database never received. updateTransaction's own result
      // is the only thing allowed to confirm a save happened.
      updateTransaction(t.id, formData, t.updated_at)
        .then((result) => {
          if (result.ok) {
            onSave?.(next);
            showToast("Transaction saved");
          } else if (result.conflict) {
            showToast(result.error ?? "Someone else already changed this transaction.");
          } else {
            showToast(result.error ?? "Couldn't save your changes");
          }
        })
        .catch(() => showToast("Couldn't save your changes"));
    }

    if (isRecurring !== wasRecurring) {
      if (isRecurring) {
        createRecurringFromTransaction(t.id).catch(() =>
          showToast("Couldn't set up recurring"),
        );
      } else if (t.recurring_transaction_id) {
        toggleRecurringActive(t.recurring_transaction_id, false).catch(() =>
          showToast("Couldn't stop recurring"),
        );
      }
    }
  }

  const isTransfer = t.kind === "transfer";
  const headerSign = isTransfer ? "none" : kind === "income" ? "+" : "-";
  const headerTone = !isTransfer && kind === "income" ? "positive" : "neutral";
  const typeOptions: { value: "expense" | "income"; label: string }[] = [
    { value: "expense", label: isDebtAccount ? "Charge" : "Expense" },
    { value: "income", label: isDebtAccount ? "Payment" : "Income" },
  ];

  return createPortal(
    <div
      className="fixed inset-0 z-[100]"
      role="dialog"
      aria-modal="true"
      aria-label={`Edit ${t.description}`}
    >
      <div
        className={`absolute inset-0 bg-black/40 ${
          closing ? "animate-modal-backdrop-out" : "animate-modal-backdrop"
        }`}
        onClick={handleClose}
      />
      <aside
        className={`absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-surface shadow-modal ${
          closing ? "animate-drawer-out" : "animate-drawer-in"
        }`}
      >
        <div className="flex h-14 shrink-0 items-center gap-1 border-b border-border px-2">
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-text-faint transition-colors hover:bg-bg hover:text-text"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M15 6l-6 6 6 6"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <p className="card-label min-w-0 flex-1 truncate text-center text-text-muted">
            {(description || t.description || "Transaction").toUpperCase()}
          </p>
          {/* Balances the back button so the title stays visually centered. */}
          <span className="size-9 shrink-0" aria-hidden="true" />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* Receipt-style header: the amount and (for a real transaction)
              its category, centered — mirrors the reference design's big
              centered figure instead of the old inline row header. */}
          <div className="flex flex-col items-center gap-2 border-b border-border px-5 py-6">
            <Money
              amount={t.amount}
              signDisplay={headerSign}
              tone={headerTone}
              className="text-4xl font-bold tracking-tight"
            />
            {isSplitParent && (
              <span className="rounded-full bg-accent-soft px-3 py-1 text-sm font-medium text-accent">
                Split across {splits!.length} categories
              </span>
            )}
          </div>

          {isSplitParent ? (
            <div className="space-y-3 p-5">
              <ul className="divide-y divide-border rounded-lg border border-border">
                {splits!.map((s, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                    <span className="text-text">
                      {s.category_id ? (categoryById.get(s.category_id)?.name ?? "—") : "Uncategorized"}
                    </span>
                    <span className="tabular font-medium text-text">{formatMoney(s.amount)}</span>
                  </li>
                ))}
              </ul>
              <PanelField label="Date">
                <p className={PANEL_FIELD_INPUT_CLASS}>{formatDate(t.txn_date)}</p>
              </PanelField>
              <PanelField label="Account">
                <p className={PANEL_FIELD_INPUT_CLASS}>{accountName}</p>
              </PanelField>
              {t.notes && (
                <PanelField label="Notes">
                  <p className={PANEL_FIELD_INPUT_CLASS}>{t.notes}</p>
                </PanelField>
              )}
              <p className="text-metadata">
                Split transactions can&apos;t be edited here yet — delete and re-add it to change
                the split.
              </p>
            </div>
          ) : isTransfer ? (
            <div className="space-y-3 p-5">
              <PanelField label="From">
                <p className={PANEL_FIELD_INPUT_CLASS}>{accountName}</p>
              </PanelField>
              <PanelField label="To">
                <p className={PANEL_FIELD_INPUT_CLASS}>{toAccountName ?? "—"}</p>
              </PanelField>
              <PanelField label="Date">
                <p className={PANEL_FIELD_INPUT_CLASS}>{formatDate(t.txn_date)}</p>
              </PanelField>
              {t.notes && (
                <PanelField label="Notes">
                  <p className={PANEL_FIELD_INPUT_CLASS}>{t.notes}</p>
                </PanelField>
              )}
            </div>
          ) : (
            <form
              ref={formRef}
              onSubmit={(e) => {
                e.preventDefault();
                handleClose();
              }}
            >
              <div className="space-y-3 p-5">
                <PanelField label="Type">
                  <div className="mt-1.5 flex gap-1.5">
                    {typeOptions.map((o) => (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => setKind(o.value)}
                        className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                          kind === o.value
                            ? "bg-accent text-white"
                            : "bg-bg text-text-muted hover:text-text"
                        }`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </PanelField>

                <PanelField label="Amount">
                  <CurrencyInput
                    name="amount"
                    required
                    defaultValue={t.amount}
                    className={`${PANEL_FIELD_INPUT_CLASS} pl-4`}
                    dollarPosition="left-0"
                  />
                </PanelField>

                <PanelField label="Merchant">
                  <input
                    name="description"
                    required
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className={PANEL_FIELD_INPUT_CLASS}
                  />
                </PanelField>

                <PanelField label="Category">
                  <CategorySelect
                    categories={categories}
                    kind={kind}
                    value={categoryId}
                    onChange={setCategoryId}
                    className={PANEL_FIELD_INPUT_CLASS}
                  />
                </PanelField>

                <PanelField label="Date">
                  <DatePicker
                    variant="panel"
                    name="txn_date"
                    required
                    defaultValue={t.txn_date}
                    min={period?.start_date}
                    max={period?.end_date}
                  />
                </PanelField>

                <PanelField label="Account">
                  <Dropdown
                    variant="panel"
                    name="account_id"
                    value={accountId}
                    onChange={setAccountId}
                    options={accountChoices(accounts, "—")}
                  />
                </PanelField>

                <PanelField label="Notes" optional>
                  <input
                    name="notes"
                    defaultValue={t.notes ?? ""}
                    maxLength={140}
                    placeholder="Anything worth remembering"
                    className={PANEL_FIELD_INPUT_CLASS}
                  />
                </PanelField>

                <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
                  <span className="text-sm text-text">Repeats monthly</span>
                  <ToggleSwitch
                    checked={isRecurring}
                    onChange={setIsRecurring}
                    label="Repeats monthly"
                  />
                </div>
              </div>

              {/* Footer: attribution, not the transaction itself. Whoever
                  logged it is set automatically at creation and isn't
                  reassignable here — this just reports it. */}
              <div className="flex items-center justify-between gap-3 border-t border-border bg-bg px-5 py-3 text-xs">
                <span className="text-text-faint">Logged by</span>
                <span className="max-w-[11rem] truncate font-medium text-text-muted">
                  {t.created_by_email || "Unknown"}
                </span>
              </div>
              <p className="px-5 py-2 text-center text-[11px] text-text-faint">
                Changes save when you close.
              </p>
            </form>
          )}

          <div className="border-t border-border">
            <button
              type="button"
              onClick={toggleHistory}
              aria-expanded={historyOpen}
              className="flex w-full items-center justify-between px-5 py-3 text-sm font-medium text-text-muted transition-colors hover:text-text"
            >
              Edit history
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
                className={`transition-transform ${historyOpen ? "rotate-180" : ""}`}
              >
                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {historyOpen && (
              <div className="animate-fade-in-up space-y-2 px-5 pb-4">
                {loadingHistory ? (
                  <p className="text-metadata">Loading…</p>
                ) : !history || history.length === 0 ? (
                  <p className="text-metadata">No edits recorded for this transaction.</p>
                ) : (
                  history.map((h) => <HistoryEntryRow key={h.id} entry={h} categoryById={categoryById} />)
                )}
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>,
    document.body,
  );
}

// One past edit's before-state — `snapshot` is the raw transactions row as
// it stood right before that edit, not a diff against the current one, so
// this reads as "what it used to be" rather than "what changed."
function HistoryEntryRow({
  entry,
  categoryById,
}: {
  entry: TransactionHistoryEntry;
  categoryById: Map<string, Category>;
}) {
  const s = entry.snapshot;
  const amount = typeof s.amount === "number" ? s.amount : null;
  const description = typeof s.description === "string" ? s.description : null;
  const txnDate = typeof s.txn_date === "string" ? s.txn_date : null;
  const categoryId = typeof s.category_id === "string" ? s.category_id : null;
  const categoryName = categoryId ? (categoryById.get(categoryId)?.name ?? null) : null;

  return (
    <div className="rounded-lg border border-border px-3 py-2.5 text-sm">
      <p className="text-metadata">
        {entry.edited_by_email ?? "Someone"} ·{" "}
        {new Date(entry.edited_at).toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })}
      </p>
      <p className="mt-1 text-text-muted">
        Was: {description ?? "—"}
        {amount !== null && <> · {formatMoney(amount)}</>}
        {txnDate && <> · {formatDate(txnDate)}</>}
        {categoryName && <> · {categoryName}</>}
      </p>
    </div>
  );
}
