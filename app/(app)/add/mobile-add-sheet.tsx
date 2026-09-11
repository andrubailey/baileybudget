"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createTransaction, createTransfer } from "@/app/actions";
import type { Account, Category } from "@/lib/types";
import { SubmitButton } from "@/app/(app)/submit-button";
import { useToast } from "@/app/(app)/toast";
import { CategorySelect } from "@/app/(app)/category-select";
import { FIELD_CLASS as fieldClass } from "@/lib/ui";
import {
  announcePendingTransaction,
  withdrawPendingTransaction,
} from "@/app/(app)/pending-transactions";

type Kind = "expense" | "transfer" | "income";

const TYPES: { key: Kind; label: string }[] = [
  { key: "expense", label: "Expense" },
  { key: "transfer", label: "Transfer" },
  { key: "income", label: "Income" },
];

function sanitizeAmount(input: string): string {
  let cleaned = input.replace(/[^\d.]/g, "");
  const firstDot = cleaned.indexOf(".");
  if (firstDot !== -1) {
    cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, "");
  }
  return cleaned;
}

function formatAmountDisplay(raw: string): string {
  if (!raw) return "0";
  const [intPart, decPart] = raw.split(".");
  const withCommas = (intPart || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return decPart !== undefined ? `${withCommas}.${decPart}` : withCommas;
}

// One sheet, three types, amount first — this is deliberately a leaner flow
// than the desktop quick-add modals (no duplicate detection, no "keep open
// for the next one," no inline recurring toggle): those are real features,
// but they all come after the number, and the whole point of a five-second
// mobile add is that nothing does. The desktop entry points (sidebar button,
// ⌥E/⌥I/⌥T) keep using the full modals unchanged.
export function MobileAddSheet({
  periodId,
  accounts,
  categories,
}: {
  periodId: string;
  accounts: Account[];
  categories: Category[];
}) {
  const router = useRouter();
  const showToast = useToast();
  const [type, setType] = useState<Kind>("expense");
  const [rawAmount, setRawAmount] = useState("");
  const [description, setDescription] = useState("");
  const [accountId, setAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");

  const kindCategories = categories.filter((c) => c.kind === (type === "income" ? "income" : "expense"));
  const selectedAccount = accounts.find((a) => a.id === accountId);
  const isDebtAccount = selectedAccount?.is_debt ?? false;
  // Same relabeling the desktop forms do: a charge on a credit card is
  // stored as kind "income" (it increases what's owed), a payment as
  // "expense" — the account picker always speaks in "charge"/"payment" for
  // a debt account rather than making the user translate that themselves.
  const effectiveKind: "income" | "expense" =
    type === "transfer" ? "expense" : isDebtAccount ? (type === "expense" ? "income" : "expense") : type;
  const actionWord = isDebtAccount ? (type === "expense" ? "charge" : "payment") : type;

  function close() {
    router.back();
  }

  async function handleSubmit(formData: FormData) {
    const amount = Number(rawAmount || 0);
    if (!amount) {
      showToast("Enter an amount");
      return;
    }

    if (type === "transfer") {
      const fromId = String(formData.get("from_account_id") ?? "");
      const toId = String(formData.get("to_account_id") ?? "");
      if (!fromId || !toId) {
        showToast("Pick both accounts");
        return;
      }
      const pendingId = announcePendingTransaction({
        kind: "transfer",
        description: description.trim() || "Transfer",
        amount,
        txn_date: new Date().toISOString().slice(0, 10),
        account_id: fromId,
        to_account_id: toId,
        category_id: null,
        period_id: periodId,
        notes: null,
      });
      const fd = new FormData();
      fd.set("amount", String(amount));
      fd.set("txn_date", new Date().toISOString().slice(0, 10));
      fd.set("from_account_id", fromId);
      fd.set("to_account_id", toId);
      fd.set("period_id", periodId);
      const result = await createTransfer(fd);
      if (!result.ok) {
        withdrawPendingTransaction(pendingId);
        showToast(result.error ? `Couldn't save: ${result.error}` : "Couldn't save transfer");
        return;
      }
      showToast("Transfer logged");
      close();
      return;
    }

    const pendingId = announcePendingTransaction({
      kind: effectiveKind,
      description: description.trim() || (type === "income" ? "Income" : "Expense"),
      amount,
      txn_date: new Date().toISOString().slice(0, 10),
      account_id: accountId || null,
      to_account_id: null,
      category_id: categoryId || null,
      period_id: periodId,
      notes: null,
      pending_approval: false,
    });
    const fd = new FormData();
    fd.set("kind", effectiveKind);
    fd.set("description", description.trim() || (type === "income" ? "Income" : "Expense"));
    fd.set("amount", String(amount));
    fd.set("txn_date", new Date().toISOString().slice(0, 10));
    fd.set("account_id", accountId);
    fd.set("category_id", categoryId);
    fd.set("period_id", periodId);
    const result = await createTransaction(fd);
    if (!result.ok) {
      withdrawPendingTransaction(pendingId);
      showToast(result.error ? `Couldn't save: ${result.error}` : "Couldn't save transaction");
      return;
    }
    showToast(`${actionWord[0].toUpperCase()}${actionWord.slice(1)} logged`);
    close();
  }

  return (
    <div
      className="animate-modal-backdrop fixed inset-0 z-50 flex items-end bg-black/40"
      onClick={close}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet-in flex max-h-[92vh] w-full flex-col overflow-y-auto rounded-t-2xl bg-surface"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-center justify-center pt-2.5 pb-1" aria-hidden="true">
          <span className="h-1 w-9 rounded-full bg-border" />
        </div>

        <div className="flex items-center justify-between px-5 pt-1 pb-3">
          <div role="tablist" className="grid grid-cols-3 gap-1 rounded-xl bg-bg p-1">
            {TYPES.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={type === t.key}
                onClick={() => setType(t.key)}
                className={`rounded-lg px-2 py-1.5 text-sm font-medium transition-colors ${
                  type === t.key ? "bg-surface text-text shadow-card" : "text-text-muted"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-lg text-text-faint transition-colors hover:bg-bg hover:text-text"
          >
            ✕
          </button>
        </div>

        <form action={handleSubmit} className="flex flex-1 flex-col px-5 pb-5">
          <label className="flex flex-col items-center gap-1 py-4">
            <span className="text-xs font-medium text-text-faint">Amount</span>
            <span className="flex items-baseline gap-1">
              <span className="tabular text-3xl font-semibold text-text-faint">$</span>
              <input
                type="text"
                inputMode="decimal"
                autoFocus
                placeholder="0"
                value={formatAmountDisplay(rawAmount)}
                onChange={(e) => setRawAmount(sanitizeAmount(e.target.value))}
                className="tabular w-full max-w-[240px] border-0 bg-transparent text-center text-5xl font-semibold text-text outline-none"
              />
            </span>
          </label>

          <div className="space-y-3">
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={type === "income" ? "Paycheck" : type === "transfer" ? "Note (optional)" : "Whole Foods"}
              className={fieldClass}
            />

            {type === "transfer" ? (
              <div className="grid grid-cols-2 gap-3">
                <select
                  name="from_account_id"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className={fieldClass}
                >
                  <option value="">From account</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <select
                  name="to_account_id"
                  value={toAccountId}
                  onChange={(e) => setToAccountId(e.target.value)}
                  className={fieldClass}
                >
                  <option value="">To account</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className={fieldClass}
                >
                  <option value="">Account</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <CategorySelect
                  categories={kindCategories}
                  kind={type === "income" ? "income" : "expense"}
                  value={categoryId}
                  onChange={setCategoryId}
                  className={fieldClass}
                />
              </div>
            )}
            {isDebtAccount && type !== "transfer" && (
              <p className="text-xs text-text-faint">
                This is a debt account — this will be logged as a {actionWord}.
              </p>
            )}
          </div>

          <div className="mt-5">
            <SubmitButton
              pendingText="Saving…"
              className="w-full rounded-xl bg-accent px-4 py-3.5 text-base font-semibold text-white transition-opacity hover:opacity-90"
            >
              Add {type === "transfer" ? "transfer" : actionWord}
            </SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}
