"use client";

import { useState, useTransition } from "react";
import { updateAccountDetails, reorderAccounts } from "@/app/actions";
import { formatMoney, progressColor } from "@/lib/format";
import type { AccountWithBalance } from "@/lib/queries";
import { ACCOUNT_TYPE_LABELS, ACCOUNT_TYPES, BANK_LOGIN_URLS } from "@/lib/types";
import { BankLogo } from "./bank-logo";
import { SubmitButton } from "@/app/(app)/submit-button";
import { useToast } from "@/app/(app)/toast";
import { StatusPill } from "@/app/(app)/status-pill";
import { EmptyState } from "@/app/(app)/empty-state";
import { Celebration, useCelebration } from "@/app/(app)/celebration";
import { FIELD_CLASS as fieldClass } from "@/lib/ui";

function defaultLoginUrl(bank: string | null): string | null {
  if (!bank) return null;
  return (BANK_LOGIN_URLS as Record<string, string>)[bank] ?? null;
}

export function AccountList({
  accounts,
  bankOptions,
}: {
  accounts: AccountWithBalance[];
  bankOptions: readonly string[];
}) {
  const [order, setOrder] = useState(accounts);
  // Server actions here (the edit modal's save, add, reorder) all revalidate
  // and hand this component a fresh `accounts` prop — without this, `order`
  // would stay frozen at whatever it was on mount and every save would show
  // a success toast while the card kept displaying the old value until a
  // manual page reload.
  const [lastAccounts, setLastAccounts] = useState(accounts);
  const { celebrationKey, fire } = useCelebration();
  if (accounts !== lastAccounts) {
    // Debt hitting $0, or a savings goal being reached, is worth a moment —
    // detected here (rather than a separate effect) since this is already
    // the one place that diffs the incoming prop against what was shown.
    const worthCelebrating = accounts.some((a) => {
      const prev = lastAccounts.find((p) => p.id === a.id);
      if (!prev) return false;
      if (a.is_debt) return prev.balance > 0 && a.balance <= 0;
      return a.goal != null && a.goal > 0 && prev.balance < a.goal && a.balance >= a.goal;
    });
    if (worthCelebrating) fire();
    setLastAccounts(accounts);
    setOrder(accounts);
  }
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [showDeactivated, setShowDeactivated] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const showToast = useToast();

  const deactivatedCount = order.filter((a) => !a.is_active).length;
  const visible = showDeactivated ? order : order.filter((a) => a.is_active);
  const editingAccount = order.find((a) => a.id === editingId) ?? null;

  function handleDragOver(e: React.DragEvent, overId: string) {
    e.preventDefault();
    if (!draggedId || draggedId === overId) return;

    setOrder((current) => {
      const fromIndex = current.findIndex((a) => a.id === draggedId);
      const toIndex = current.findIndex((a) => a.id === overId);
      if (fromIndex === -1 || toIndex === -1) return current;
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }

  function handleDrop() {
    setDraggedId(null);
    startTransition(() => {
      reorderAccounts(order.map((a) => a.id));
    });
  }

  if (order.length === 0) {
    return <EmptyState message="No accounts yet — add your first one above." />;
  }

  return (
    <div>
      <Celebration celebrationKey={celebrationKey} />
      {deactivatedCount > 0 && (
        <button
          type="button"
          onClick={() => setShowDeactivated((v) => !v)}
          className="mb-4 text-xs font-medium text-text-faint hover:text-accent"
        >
          {showDeactivated
            ? "Hide deactivated accounts"
            : `Show ${deactivatedCount} deactivated account${deactivatedCount === 1 ? "" : "s"}`}
        </button>
      )}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {visible.map((a, i) => {
          const progress =
            !a.is_debt && a.goal && a.goal > 0
              ? Math.min(100, Math.max(0, (a.balance / a.goal) * 100))
              : null;
          // Debt payoff progress: how much of the gap between the starting
          // balance and the goal (usually 0) has been paid down so far.
          const goal = a.goal ?? 0;
          const payoffSpan = a.starting_balance - goal;
          const payoffProgress =
            a.is_debt && payoffSpan !== 0
              ? Math.min(100, Math.max(0, ((a.starting_balance - a.balance) / payoffSpan) * 100))
              : null;
          const belowAlert =
            !a.is_debt && a.low_balance_alert !== null && a.balance < a.low_balance_alert;
          const loginUrl = a.login_url || defaultLoginUrl(a.bank);
          return (
            <div
              key={a.id}
              draggable
              onDragStart={() => setDraggedId(a.id)}
              onDragOver={(e) => handleDragOver(e, a.id)}
              onDrop={handleDrop}
              onDragEnd={handleDrop}
              style={{ animationDelay: `${i * 40}ms` }}
              className={`card-hover animate-fade-in-up cursor-grab rounded-xl border border-border bg-surface p-5 shadow-card sm:p-6 active:cursor-grabbing ${
                draggedId === a.id ? "opacity-50" : ""
              }`}
            >
              {/* Same icon-top-left, label-block-below layout as the
                  Overview dashboard's metric cards — one neutral icon style
                  for every account instead of a per-type color accent. */}
              <div className="flex items-start justify-between">
                {a.bank ? (
                  <BankLogo bank={a.bank} size="lg" />
                ) : (
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-bg text-text-muted">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M3 10h18M6 6h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z"
                        stroke="currentColor"
                        strokeWidth={1.6}
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setEditingId(a.id)}
                  aria-label={`Edit ${a.name}`}
                  className="flex size-10 shrink-0 items-center justify-center rounded-lg text-text-faint hover:bg-bg hover:text-text"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5M18.4 3.6a2 2 0 1 1 2.8 2.8L12 15.6l-4 1 1-4 9.4-8.4Z"
                      stroke="currentColor"
                      strokeWidth={1.6}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>

              <p className="mt-3 truncate font-medium text-text">{a.name}</p>

              {(a.account_type || a.is_debt || !a.is_active) && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {a.account_type && (
                    <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] font-semibold text-text-faint">
                      {ACCOUNT_TYPE_LABELS[a.account_type]}
                    </span>
                  )}
                  {a.is_debt && (
                    <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] font-semibold text-text-faint">
                      Debt
                    </span>
                  )}
                  {!a.is_active && (
                    <span className="rounded-full bg-bg px-1.5 py-0.5 text-[10px] font-semibold text-text-faint">
                      Deactivated
                    </span>
                  )}
                </div>
              )}

              <p className="tabular mt-2.5 text-2xl font-semibold text-text">
                {formatMoney(a.balance)}
                {a.is_debt && <span className="ml-1 text-sm font-normal text-text-faint">owed</span>}
              </p>

              {belowAlert && (
                <StatusPill variant="danger" className="mt-1.5">
                  Below your {formatMoney(a.low_balance_alert!)} alert threshold
                </StatusPill>
              )}

              {loginUrl && (
                <a
                  href={loginUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                >
                  Log in to {a.bank ?? "bank"} ↗
                </a>
              )}

              {progress !== null && (
                <div className="mt-4">
                  <div className="tabular flex justify-between text-xs text-text-faint">
                    <span>
                      {formatMoney(a.balance)} / {formatMoney(a.goal!)}
                    </span>
                    <span>{progress.toFixed(0)}%</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-bg">
                    <div
                      className="animate-bar-grow-x h-1.5 rounded-full transition-colors duration-300"
                      style={{ width: `${progress}%`, backgroundColor: progressColor(progress) }}
                    />
                  </div>
                </div>
              )}

              {payoffProgress !== null && (
                <div className="mt-4">
                  <div className="tabular flex justify-between text-xs text-text-faint">
                    <span>
                      {formatMoney(a.balance)} owed / {formatMoney(a.starting_balance)} starting
                    </span>
                    <span>{payoffProgress.toFixed(0)}% paid off</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-bg">
                    <div
                      className="animate-bar-grow-x h-1.5 rounded-full bg-success"
                      style={{ width: `${payoffProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {editingAccount && (
        <AccountEditModal
          account={editingAccount}
          bankOptions={bankOptions}
          onClose={() => setEditingId(null)}
          onSaved={() => showToast(`${editingAccount.name} updated`)}
        />
      )}
    </div>
  );
}

function AccountEditModal({
  account: a,
  bankOptions,
  onClose,
  onSaved,
}: {
  account: AccountWithBalance;
  bankOptions: readonly string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [isDebt, setIsDebt] = useState(a.is_debt);

  async function handleSubmit(formData: FormData) {
    const goalRaw = String(formData.get("goal") ?? "").trim();
    const bank = String(formData.get("bank") ?? "").trim() || null;
    const account_type = String(formData.get("account_type") ?? "").trim() || null;
    const login_url = String(formData.get("login_url") ?? "").trim() || null;
    const lowBalanceRaw = String(formData.get("low_balance_alert") ?? "").trim();
    const is_debt = formData.get("is_debt") === "on";
    const is_active = formData.get("is_active") === "on";

    await updateAccountDetails(a.id, {
      goal: goalRaw ? Number(goalRaw) : null,
      bank,
      account_type,
      login_url,
      low_balance_alert: is_debt || !lowBalanceRaw ? null : Number(lowBalanceRaw),
      is_debt,
      is_active,
    });
    onSaved();
    onClose();
  }

  return (
    <div
      className="animate-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-modal-panel max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-surface p-6 shadow-modal"
      >
        <div className="mb-4 flex items-start justify-between">
          <h2 className="text-lg font-semibold text-text">Edit {a.name}</h2>
          <button
            type="button"
            onClick={onClose}
            className="-mr-2.5 flex size-11 shrink-0 items-center justify-center rounded-lg text-text-faint hover:bg-bg hover:text-text"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <form action={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text">Goal</label>
            <input
              type="number"
              step="0.01"
              name="goal"
              defaultValue={a.goal ?? ""}
              placeholder="Set a goal"
              className={fieldClass}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text">Bank</label>
            <select name="bank" defaultValue={a.bank ?? ""} className={fieldClass}>
              <option value="">No bank</option>
              {bankOptions.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text">Account type</label>
            <select name="account_type" defaultValue={a.account_type ?? ""} className={fieldClass}>
              <option value="">Unspecified type</option>
              {ACCOUNT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ACCOUNT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text">Login page URL</label>
            <input
              type="url"
              name="login_url"
              defaultValue={a.login_url ?? ""}
              placeholder={defaultLoginUrl(a.bank) ?? "Login page URL"}
              className={fieldClass}
            />
          </div>

          {!isDebt && (
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-sm font-medium text-text">Low balance alert</label>
              <input
                type="number"
                step="0.01"
                name="low_balance_alert"
                defaultValue={a.low_balance_alert ?? ""}
                placeholder="Alert me below this amount"
                className={fieldClass}
              />
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-text sm:col-span-2">
            <input
              type="checkbox"
              name="is_debt"
              checked={isDebt}
              onChange={(e) => setIsDebt(e.target.checked)}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            This is a debt account (loan, credit card)
          </label>

          <label className="flex items-center gap-2 text-sm text-text sm:col-span-2">
            <input
              type="checkbox"
              name="is_active"
              defaultChecked={a.is_active}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            Active
          </label>

          <div className="flex items-center gap-3 sm:col-span-2">
            <SubmitButton pendingText="Saving…">Save changes</SubmitButton>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-text-muted hover:bg-bg"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
