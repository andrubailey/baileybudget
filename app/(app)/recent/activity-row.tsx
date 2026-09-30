"use client";

import { useState } from "react";
import { Avatar } from "@/components/ui";
import { deleteTransaction, updateTransaction } from "@/app/actions";
import { useToast } from "@/app/(app)/toast";
import {
  firstNameFromEmail,
  formatMoney,
  transferDisplayDescription,
} from "@/lib/format";
import type { Account, Category, Transaction } from "@/lib/types";

function sanitizeAmount(input: string): string {
  let cleaned = input.replace(/[^\d.]/g, "");
  const firstDot = cleaned.indexOf(".");
  if (firstDot !== -1) {
    cleaned =
      cleaned.slice(0, firstDot + 1) +
      cleaned.slice(firstDot + 1).replace(/\./g, "");
  }
  const [whole, decimals] = cleaned.split(".");
  return decimals === undefined ? whole : `${whole}.${decimals.slice(0, 2)}`;
}

function personName(t: Transaction, nameById: Map<string, string>): string {
  if (t.created_by && nameById.has(t.created_by)) {
    return nameById.get(t.created_by)!;
  }
  if (t.created_by_email) return firstNameFromEmail(t.created_by_email);
  return "Unknown";
}

// One transaction. Tapping expands an editor in place rather than pushing a
// detail page: the point of scanning this list is catching the one entry
// that's wrong, and losing your scroll position to fix it means finding your
// place again afterward.
export function ActivityRow({
  transaction: t,
  accounts,
  categories,
  nameById,
}: {
  transaction: Transaction;
  accounts: Account[];
  categories: Category[];
  nameById: Map<string, string>;
}) {
  const showToast = useToast();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [description, setDescription] = useState(t.description);
  const [rawAmount, setRawAmount] = useState(String(t.amount));
  const [categoryId, setCategoryId] = useState(t.category_id ?? "");
  const [date, setDate] = useState(t.txn_date);

  const category = categories.find((c) => c.id === t.category_id) ?? null;
  const toAccount = accounts.find((a) => a.id === t.to_account_id) ?? null;
  const label = transferDisplayDescription(t.description, t.kind, toAccount?.bank);
  const who = personName(t, nameById);

  // Income reads as money in, expense as money out. A transfer moved nothing
  // in or out of the household, so it gets no sign at all.
  const signed =
    t.kind === "income" ? t.amount : t.kind === "expense" ? -t.amount : t.amount;
  const amountText =
    t.kind === "transfer"
      ? formatMoney(t.amount)
      : `${signed > 0 ? "+" : "−"}${formatMoney(Math.abs(signed))}`;

  const kindCategories = categories.filter(
    (c) => c.kind === (t.kind === "income" ? "income" : "expense"),
  );

  async function save() {
    if (saving) return;
    const amount = Number(rawAmount || 0);
    if (!amount) {
      showToast("Enter an amount");
      return;
    }
    setSaving(true);
    const fd = new FormData();
    fd.set("kind", t.kind === "transfer" ? "expense" : t.kind);
    fd.set("description", description.trim() || t.description);
    fd.set("amount", String(amount));
    fd.set("txn_date", date);
    fd.set("account_id", t.account_id ?? "");
    // A transfer has no category and the schema enforces that, so editing one
    // here must not try to attach one.
    fd.set("category_id", t.kind === "transfer" ? "" : categoryId);
    fd.set("notes", t.notes ?? "");
    const result = await updateTransaction(t.id, fd, t.updated_at);
    setSaving(false);
    if (!result.ok) {
      showToast(
        result.conflict
          ? "Someone else edited this one — reload to see their version."
          : result.error
            ? `Couldn't save: ${result.error}`
            : "Couldn't save",
      );
      return;
    }
    setEditing(false);
    showToast("Updated");
  }

  async function remove() {
    if (saving) return;
    setSaving(true);
    await deleteTransaction(t.id);
    setSaving(false);
    setEditing(false);
    showToast("Deleted");
  }

  return (
    <li className="border-b border-(--bg-card-subtle) last:border-0">
      <button
        type="button"
        onClick={() => setEditing((v) => !v)}
        aria-expanded={editing}
        className="ui-pressable flex w-full items-center gap-(--space-3) py-(--space-3) text-left"
      >
        <Avatar initial={who} label={`Logged by ${who}`} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="ui-body block truncate font-medium text-(--text-primary)">
            {label}
          </span>
          <span className="ui-caption block truncate">
            {t.kind === "transfer"
              ? "Transfer"
              : (category?.name ?? "Uncategorized")}
          </span>
        </span>
        <span
          className={`ui-body ui-tabular shrink-0 font-semibold ${
            t.kind === "income"
              ? "text-(--accent-positive)"
              : "text-(--text-primary)"
          }`}
        >
          {amountText}
        </span>
      </button>

      {editing && (
        <div className="pb-(--space-4)">
          <div className="flex gap-(--space-2)">
            <label className="min-w-0 flex-1">
              <span className="sr-only">Merchant</span>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                autoCapitalize="words"
                autoCorrect="off"
                spellCheck={false}
                autoComplete="off"
                className="w-full rounded-(--radius-field) bg-(--bg-card-subtle) px-(--space-3) py-(--space-2) text-(length:--text-body) text-(--text-primary) outline-none"
              />
            </label>
            <label className="w-[9ch]">
              <span className="sr-only">Amount</span>
              <input
                value={rawAmount}
                onChange={(e) => setRawAmount(sanitizeAmount(e.target.value))}
                inputMode="decimal"
                autoComplete="off"
                className="ui-tabular w-full rounded-(--radius-field) bg-(--bg-card-subtle) px-(--space-3) py-(--space-2) text-right text-(length:--text-body) text-(--text-primary) outline-none"
              />
            </label>
          </div>

          {t.kind !== "transfer" && (
            <div className="-mx-(--space-4) mt-(--space-2) overflow-x-auto px-(--space-4) [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex gap-(--space-2)">
                {kindCategories.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategoryId(categoryId === c.id ? "" : c.id)}
                    aria-pressed={categoryId === c.id}
                    className={`ui-pressable shrink-0 rounded-(--radius-pill) px-(--space-3) py-(--space-2) text-(length:--text-caption) font-medium whitespace-nowrap ${
                      categoryId === c.id
                        ? "bg-(--text-primary) text-(--bg-card)"
                        : "bg-(--bg-card-subtle) text-(--text-primary)"
                    }`}
                  >
                    {c.icon ? `${c.icon} ${c.name}` : c.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-(--space-2) flex items-center gap-(--space-2)">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value || t.txn_date)}
              aria-label="Date"
              className="ui-tabular min-w-0 flex-1 rounded-(--radius-field) bg-(--bg-card-subtle) px-(--space-3) py-(--space-2) text-(length:--text-caption) text-(--text-primary) outline-none"
            />
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="ui-pressable rounded-(--radius-pill) bg-(--text-primary) px-(--space-4) py-(--space-2) text-(length:--text-caption) font-semibold text-(--bg-card) disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => void remove()}
              disabled={saving}
              className="ui-pressable rounded-(--radius-pill) px-(--space-3) py-(--space-2) text-(length:--text-caption) font-medium text-(--accent-caution) disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
