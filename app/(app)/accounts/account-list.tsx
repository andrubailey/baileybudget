"use client";

import { useState, useTransition } from "react";
import {
  toggleAccountActive,
  updateAccountBank,
  updateAccountGoal,
  updateAccountIsDebt,
  updateAccountLoginUrl,
  updateAccountLowBalanceAlert,
  updateAccountType,
  reorderAccounts,
} from "@/app/actions";
import { formatMoney, progressColor } from "@/lib/format";
import type { AccountWithBalance } from "@/lib/queries";
import { ACCOUNT_TYPE_LABELS, ACCOUNT_TYPES, BANK_LOGIN_URLS } from "@/lib/types";
import { BankLogo } from "./bank-logo";
import { SubmitButton } from "@/app/(app)/submit-button";
import { useToast } from "@/app/(app)/toast";
import { getAccountColor } from "@/lib/account-colors";
import { StatusPill } from "@/app/(app)/status-pill";
import { EmptyState } from "@/app/(app)/empty-state";

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
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [showDeactivated, setShowDeactivated] = useState(false);
  const [, startTransition] = useTransition();
  const showToast = useToast();

  const deactivatedCount = order.filter((a) => !a.is_active).length;
  const visible = showDeactivated ? order : order.filter((a) => a.is_active);

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

  // Touch screens can't drag-reorder easily, so up/down buttons are the
  // accessible/mobile fallback for the same reorder action.
  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next);
    startTransition(() => {
      reorderAccounts(next.map((a) => a.id));
    });
  }

  if (order.length === 0) {
    return <EmptyState message="No accounts yet — add your first one above." />;
  }

  return (
    <div>
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {visible.map((a) => {
        const index = order.findIndex((o) => o.id === a.id);
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
        const accountColor = getAccountColor(a.account_type, a.is_debt);
        return (
          <div
            key={a.id}
            draggable
            onDragStart={() => setDraggedId(a.id)}
            onDragOver={(e) => handleDragOver(e, a.id)}
            onDrop={handleDrop}
            onDragEnd={handleDrop}
            style={{ borderLeftColor: accountColor, borderLeftWidth: 3 }}
            className={`cursor-grab rounded-xl border border-border bg-surface p-5 shadow-card active:cursor-grabbing ${
              draggedId === a.id ? "opacity-50" : ""
            }`}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className="flex size-8 shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: `${accountColor}26` }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M3 10h18M6 6h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z"
                        stroke={accountColor}
                        strokeWidth={1.6}
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <p className="font-medium text-text">{a.name}</p>
                  {a.bank && <BankLogo bank={a.bank} size="lg" />}
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
                </div>
                <p className="tabular mt-1 text-2xl font-semibold text-text">
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
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <div className="flex gap-0.5">
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label={`Move ${a.name} up`}
                    className="rounded p-0.5 text-text-faint hover:bg-bg disabled:opacity-30"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={index === order.length - 1}
                    aria-label={`Move ${a.name} down`}
                    className="rounded p-0.5 text-text-faint hover:bg-bg disabled:opacity-30"
                  >
                    ▼
                  </button>
                </div>
                <form
                  action={async () => {
                    await toggleAccountActive(a.id, !a.is_active);
                    showToast(a.is_active ? `${a.name} deactivated` : `${a.name} reactivated`);
                  }}
                >
                  <button
                    type="submit"
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      a.is_active
                        ? "bg-accent-soft text-accent"
                        : "bg-bg text-text-faint"
                    }`}
                  >
                    {a.is_active ? "Active" : "Deactivated"}
                  </button>
                </form>
              </div>
            </div>

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
                    className="h-1.5 rounded-full"
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
                    className="h-1.5 rounded-full bg-success"
                    style={{ width: `${payoffProgress}%` }}
                  />
                </div>
              </div>
            )}

            <form
              action={async (formData: FormData) => {
                const raw = String(formData.get("goal") ?? "").trim();
                const goal = raw ? Number(raw) : null;
                await updateAccountGoal(a.id, goal);
                showToast(`${a.name}'s goal saved`);
              }}
              className="mt-2 flex items-center gap-2"
            >
              <input
                type="number"
                step="0.01"
                name="goal"
                defaultValue={a.goal ?? ""}
                placeholder="Set goal"
                className="w-full rounded-md border border-border bg-bg px-2 py-1.5 text-base sm:py-1 sm:text-xs text-text outline-none focus:border-accent"
              />
              <SubmitButton
                pendingText="Saving…"
                className="shrink-0 rounded-md border border-border px-2 py-1 text-xs font-medium text-text-muted hover:bg-bg"
              >
                Save
              </SubmitButton>
            </form>

            <form
              action={async (formData: FormData) => {
                const bank = String(formData.get("bank") ?? "").trim() || null;
                await updateAccountBank(a.id, bank);
                showToast(`${a.name}'s bank saved`);
              }}
              className="mt-4 flex items-center gap-2"
            >
              <select
                name="bank"
                defaultValue={a.bank ?? ""}
                className="w-full rounded-md border border-border bg-bg px-2 py-1.5 text-base sm:py-1 sm:text-xs text-text outline-none focus:border-accent"
              >
                <option value="">No bank</option>
                {bankOptions.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
              <SubmitButton
                pendingText="Saving…"
                className="shrink-0 rounded-md border border-border px-2 py-1 text-xs font-medium text-text-muted hover:bg-bg"
              >
                Save
              </SubmitButton>
            </form>

            <form
              action={async (formData: FormData) => {
                const account_type = String(formData.get("account_type") ?? "").trim() || null;
                await updateAccountType(a.id, account_type);
                showToast(`${a.name}'s account type saved`);
              }}
              className="mt-2 flex items-center gap-2"
            >
              <select
                name="account_type"
                defaultValue={a.account_type ?? ""}
                className="w-full rounded-md border border-border bg-bg px-2 py-1.5 text-base sm:py-1 sm:text-xs text-text outline-none focus:border-accent"
              >
                <option value="">Unspecified type</option>
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {ACCOUNT_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
              <SubmitButton
                pendingText="Saving…"
                className="shrink-0 rounded-md border border-border px-2 py-1 text-xs font-medium text-text-muted hover:bg-bg"
              >
                Save
              </SubmitButton>
            </form>

            <form
              action={async (formData: FormData) => {
                const login_url = String(formData.get("login_url") ?? "").trim() || null;
                await updateAccountLoginUrl(a.id, login_url);
                showToast(`${a.name}'s login link saved`);
              }}
              className="mt-2 flex items-center gap-2"
            >
              <input
                type="url"
                name="login_url"
                defaultValue={a.login_url ?? ""}
                placeholder={defaultLoginUrl(a.bank) ?? "Login page URL"}
                className="w-full rounded-md border border-border bg-bg px-2 py-1.5 text-base sm:py-1 sm:text-xs text-text outline-none focus:border-accent"
              />
              <SubmitButton
                pendingText="Saving…"
                className="shrink-0 rounded-md border border-border px-2 py-1 text-xs font-medium text-text-muted hover:bg-bg"
              >
                Save
              </SubmitButton>
            </form>

            {!a.is_debt && (
              <form
                action={async (formData: FormData) => {
                  const raw = String(formData.get("low_balance_alert") ?? "").trim();
                  const value = raw ? Number(raw) : null;
                  await updateAccountLowBalanceAlert(a.id, value);
                  showToast(`${a.name}'s alert threshold saved`);
                }}
                className="mt-2 flex items-center gap-2"
              >
                <input
                  type="number"
                  step="0.01"
                  name="low_balance_alert"
                  defaultValue={a.low_balance_alert ?? ""}
                  placeholder="Low balance alert"
                  className="w-full rounded-md border border-border bg-bg px-2 py-1.5 text-base sm:py-1 sm:text-xs text-text outline-none focus:border-accent"
                />
                <SubmitButton
                  pendingText="Saving…"
                  className="shrink-0 rounded-md border border-border px-2 py-1 text-xs font-medium text-text-muted hover:bg-bg"
                >
                  Save
                </SubmitButton>
              </form>
            )}

            <label className="mt-3 flex items-center gap-2 text-xs text-text-muted">
              <input
                type="checkbox"
                checked={a.is_debt}
                onChange={(e) => updateAccountIsDebt(a.id, e.target.checked)}
                className="h-3.5 w-3.5 accent-[var(--accent)]"
              />
              This is a debt account (loan, credit card)
            </label>
          </div>
        );
      })}
      </div>
    </div>
  );
}
