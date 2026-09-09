"use client";

import { useRef, useState } from "react";
import {
  removeAccountLogo,
  updateAccountDetails,
  uploadAccountLogo,
} from "@/app/actions";
import { formatMoney } from "@/lib/format";
import { Money } from "@/app/(app)/money";
import { SegmentedProgress } from "@/app/(app)/segmented-progress";
import type { AccountWithBalance } from "@/lib/queries";
import {
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_TYPES,
  BANK_LOGIN_URLS,
} from "@/lib/types";
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
  // Server actions here (the edit modal's save, add) all revalidate and hand
  // this component a fresh `accounts` prop — this only exists to diff that
  // against what was last shown, for the celebration check below.
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
      return (
        a.goal != null &&
        a.goal > 0 &&
        prev.balance < a.goal &&
        a.balance >= a.goal
      );
    });
    if (worthCelebrating) fire();
    setLastAccounts(accounts);
  }
  const [showDeactivated, setShowDeactivated] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const showToast = useToast();

  const deactivatedCount = accounts.filter((a) => !a.is_active).length;
  const visible = showDeactivated ? accounts : accounts.filter((a) => a.is_active);
  const editingAccount = accounts.find((a) => a.id === editingId) ?? null;

  // Business first, then Personal, then Debt — same split as the dashboard's
  // Accounts card.
  const groups: {
    key: string;
    label: string;
    accounts: AccountWithBalance[];
  }[] = [
    {
      key: "business",
      label: "Business",
      accounts: visible.filter((a) => !a.is_debt && a.is_business),
    },
    {
      key: "personal",
      label: "Personal",
      accounts: visible.filter((a) => !a.is_debt && !a.is_business),
    },
    { key: "debt", label: "Debt", accounts: visible.filter((a) => a.is_debt) },
  ].filter((g) => g.accounts.length > 0);

  if (accounts.length === 0) {
    return <EmptyState message="No accounts yet — add your first one above." />;
  }

  let cardIndex = 0;

  return (
    <div>
      <Celebration celebrationKey={celebrationKey} />
      {groups.map((group) => (
        <div key={group.key} className="mb-6 last:mb-0">
          {groups.length > 1 && (
            <p className="mb-3 text-[11px] font-semibold tracking-wide text-text-faint uppercase">
              {group.label}
            </p>
          )}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {group.accounts.map((a) => {
              const i = cardIndex++;
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
                  ? Math.min(
                      100,
                      Math.max(
                        0,
                        ((a.starting_balance - a.balance) / payoffSpan) * 100,
                      ),
                    )
                  : null;
              const belowAlert =
                !a.is_debt &&
                a.low_balance_alert !== null &&
                a.balance < a.low_balance_alert;
              const loginUrl = a.login_url || defaultLoginUrl(a.bank);
              const paidOff = a.is_debt && a.balance <= 0;
              const metaParts = [
                a.account_type ? ACCOUNT_TYPE_LABELS[a.account_type] : null,
                a.is_business ? "Business" : null,
                a.is_debt ? "Debt" : null,
              ].filter((p): p is string => p !== null);
              return (
                <div
                  key={a.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setEditingId(a.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setEditingId(a.id);
                    }
                  }}
                  aria-label={`Edit ${a.name}`}
                  style={{ animationDelay: `${i * 40}ms` }}
                  className={`card-hover animate-fade-in-up cursor-pointer rounded-xl border border-border bg-surface p-5 shadow-card sm:p-6 ${
                    !a.is_active ? "opacity-70" : ""
                  }`}
                >
                  <div className="flex items-start justify-between">
                    {a.logo_url ? (
                      <span className="inline-flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-white">
                        {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded storage URL, not a local/known-domain asset */}
                        <img
                          src={a.logo_url}
                          alt=""
                          className="size-full object-cover"
                        />
                      </span>
                    ) : a.bank ? (
                      <BankLogo bank={a.bank} size="lg" />
                    ) : (
                      <span className="flex size-14 shrink-0 items-center justify-center rounded-md bg-bg text-text-muted">
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                        >
                          <path
                            d="M3 10h18M6 6h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z"
                            stroke="currentColor"
                            strokeWidth={1.6}
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                    )}
                    {!a.is_active && (
                      <span className="rounded-full bg-bg px-1.5 py-0.5 text-[10px] font-semibold text-text-faint">
                        Deactivated
                      </span>
                    )}
                  </div>

                  <div className="mt-3">
                    <p className="truncate font-semibold text-text">
                      {a.name}
                    </p>
                    {metaParts.length > 0 && (
                      <p className="mt-0.5 truncate text-xs text-text-faint">
                        {metaParts.join(" · ")}
                      </p>
                    )}
                  </div>

                  <div className="mt-2.5 flex items-baseline gap-1.5">
                    <Money
                      amount={a.balance}
                      variant="balance"
                      tone={a.is_debt && !paidOff ? "negative" : undefined}
                      className="text-[28px] leading-[34px] font-bold tracking-[-0.005em] text-text"
                    />
                    {a.is_debt && (
                      <span className="text-sm font-normal text-text-faint">
                        {paidOff ? "paid off" : "owed"}
                      </span>
                    )}
                  </div>

                  {belowAlert && (
                    <StatusPill variant="danger" className="mt-1.5">
                      Below your {formatMoney(a.low_balance_alert!)} alert
                      threshold
                    </StatusPill>
                  )}

                  {loginUrl && (
                    <a
                      href={loginUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                    >
                      Log in to {a.bank ?? "bank"} ↗
                    </a>
                  )}

                  {progress !== null && (
                    <div className="mt-4">
                      <div className="flex items-baseline justify-between text-xs text-text-faint">
                        <span className="tabular">
                          <Money amount={a.balance} /> of{" "}
                          <Money amount={a.goal!} />
                        </span>
                        <span className="tabular font-semibold text-text">
                          {progress.toFixed(0)}%
                        </span>
                      </div>
                      <SegmentedProgress
                        pct={progress}
                        overBudget={false}
                        className="mt-1.5 w-full"
                      />
                    </div>
                  )}

                  {payoffProgress !== null && (
                    <div className="mt-4">
                      <div className="flex items-baseline justify-between text-xs text-text-faint">
                        <span className="tabular">
                          <Money amount={a.balance} /> owed of{" "}
                          <Money amount={a.starting_balance} /> starting
                        </span>
                        <span className="tabular font-semibold text-positive">
                          {payoffProgress.toFixed(0)}%
                        </span>
                      </div>
                      <SegmentedProgress
                        pct={payoffProgress}
                        overBudget={false}
                        className="mt-1.5 w-full"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {deactivatedCount > 0 && (
        <button
          type="button"
          onClick={() => setShowDeactivated((v) => !v)}
          className="mt-6 text-[11px] text-text-faint/70 hover:text-text-faint"
        >
          {showDeactivated
            ? "Hide deactivated accounts"
            : `Show ${deactivatedCount} deactivated account${deactivatedCount === 1 ? "" : "s"}`}
        </button>
      )}

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
  const [isBusiness, setIsBusiness] = useState(a.is_business);
  const [logoPreview, setLogoPreview] = useState(a.logo_url ?? "");
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const logoFileInputRef = useRef<HTMLInputElement>(null);
  const showToast = useToast();

  async function handleLogoFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setLogoError("Please choose an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setLogoError("Image must be under 5MB.");
      return;
    }

    setLogoError(null);
    setLogoUploading(true);
    const objectUrl = URL.createObjectURL(file);
    setLogoPreview(objectUrl);

    const fd = new FormData();
    fd.set("logo_file", file);
    const result = await uploadAccountLogo(a.id, fd);
    setLogoUploading(false);
    URL.revokeObjectURL(objectUrl);

    if (!result.ok || !result.url) {
      setLogoPreview(a.logo_url ?? "");
      setLogoError(result.error ?? "Couldn't upload photo.");
      return;
    }
    setLogoPreview(result.url);
    showToast("Photo updated");
  }

  async function handleRemoveLogo() {
    setLogoUploading(true);
    await removeAccountLogo(a.id);
    setLogoUploading(false);
    setLogoPreview("");
    showToast("Photo removed");
  }

  async function handleSubmit(formData: FormData) {
    const name = String(formData.get("name") ?? "").trim() || a.name;
    const goalRaw = String(formData.get("goal") ?? "").trim();
    const bank = String(formData.get("bank") ?? "").trim() || null;
    const account_type =
      String(formData.get("account_type") ?? "").trim() || null;
    const login_url = String(formData.get("login_url") ?? "").trim() || null;
    const is_debt = formData.get("is_debt") === "on";
    const is_active = formData.get("is_active") === "on";
    const is_business = formData.get("is_business") === "on";

    await updateAccountDetails(a.id, {
      name,
      goal: goalRaw ? Number(goalRaw) : null,
      bank,
      account_type,
      login_url,
      // No longer editable from this form — pass the account's existing
      // value straight through instead of dropping it every time something
      // else on the card is saved.
      low_balance_alert: is_debt ? null : a.low_balance_alert,
      is_debt,
      is_active,
      is_business,
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
            className="-mr-2.5 flex size-11 shrink-0 items-center justify-center rounded-lg text-text-faint transition-colors hover:bg-bg hover:text-text"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <form
          action={handleSubmit}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
        >
          <div className="flex items-center gap-3 sm:col-span-2">
            <input
              ref={logoFileInputRef}
              type="file"
              accept="image/*"
              onChange={handleLogoFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => logoFileInputRef.current?.click()}
              disabled={logoUploading}
              className="group relative size-14 shrink-0 overflow-hidden rounded-full border border-border bg-white disabled:opacity-70"
              aria-label="Change account photo"
            >
              {logoPreview ? (
                // eslint-disable-next-line @next/next/no-img-element -- user-uploaded storage URL, not a local/known-domain asset
                <img
                  src={logoPreview}
                  alt=""
                  className="size-14 object-cover"
                />
              ) : (
                <span className="flex size-14 items-center justify-center text-text-faint">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M3 10h18M6 6h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z"
                      stroke="currentColor"
                      strokeWidth={1.6}
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              )}
              <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-[11px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                {logoUploading ? "…" : "Change"}
              </span>
            </button>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-medium text-text">Account photo</p>
              <p className="text-xs text-text-faint">
                Used instead of the bank badge, e.g. for a bank not in the list.
              </p>
              {logoPreview && (
                <button
                  type="button"
                  onClick={handleRemoveLogo}
                  disabled={logoUploading}
                  className="text-xs font-medium text-negative hover:underline disabled:opacity-50"
                >
                  Remove photo
                </button>
              )}
              {logoError && (
                <p className="text-xs text-negative">{logoError}</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-sm font-medium text-text">Name</label>
            <input
              type="text"
              name="name"
              required
              defaultValue={a.name}
              className={fieldClass}
            />
          </div>

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
            <select
              name="bank"
              defaultValue={a.bank ?? ""}
              className={fieldClass}
            >
              <option value="">No bank</option>
              {bankOptions.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text">
              Account type
            </label>
            <select
              name="account_type"
              defaultValue={a.account_type ?? ""}
              className={fieldClass}
            >
              <option value="">Unspecified type</option>
              {ACCOUNT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ACCOUNT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text">
              Login page URL
            </label>
            <input
              type="url"
              name="login_url"
              defaultValue={a.login_url ?? ""}
              placeholder={defaultLoginUrl(a.bank) ?? "Login page URL"}
              className={fieldClass}
            />
          </div>

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
              name="is_business"
              checked={isBusiness}
              onChange={(e) => setIsBusiness(e.target.checked)}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            Business account (groups it separately on the dashboard)
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
              className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-text-muted transition-colors hover:bg-bg"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
