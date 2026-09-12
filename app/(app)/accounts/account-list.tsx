"use client";

import { Dropdown } from "@/app/(app)/dropdown";
import { accountTypeChoices, bankChoices } from "@/app/(app)/dropdown-options";

import { useRef, useState } from "react";
import {
  removeAccountLogo,
  updateAccountDetails,
  uploadAccountLogo,
} from "@/app/actions";
import { formatMoney, progressColor } from "@/lib/format";
import { Money } from "@/app/(app)/money";
import { SegmentedProgress } from "@/app/(app)/segmented-progress";
import type { AccountWithBalance } from "@/lib/queries";
import {
  ACCOUNT_TYPE_LABELS,
  BANK_LOGIN_URLS,
} from "@/lib/types";
import { BankLogo } from "./bank-logo";
import { SubmitButton } from "@/app/(app)/submit-button";
import { useToast } from "@/app/(app)/toast";
import { StatusPill } from "@/app/(app)/status-pill";
import { EmptyState } from "@/app/(app)/empty-state";
import { Celebration, useCelebration } from "@/app/(app)/celebration";
import { PANEL_FIELD_INPUT_CLASS } from "@/lib/ui";
import { PanelField } from "@/app/(app)/panel-field";
import { ToggleSwitch } from "@/app/(app)/toggle-switch";

function defaultLoginUrl(bank: string | null): string | null {
  if (!bank) return null;
  return (BANK_LOGIN_URLS as Record<string, string>)[bank] ?? null;
}

export function AccountList({
  accounts,
  bankOptions,
  withRail = false,
}: {
  accounts: AccountWithBalance[];
  bankOptions: readonly string[];
  // A side rail (the Home card) sits next to the list — one column fewer.
  withRail?: boolean;
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
            <p className="text-section-label mb-3">
              {group.label}
            </p>
          )}
          <div
            className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${withRail ? "xl:grid-cols-4" : "lg:grid-cols-4"}`}
          >
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
                  style={{ animationDelay: `${i * 12}ms` }}
                  className={`card card-hover animate-fade-in-up cursor-pointer ${
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
                      className="text-balance-sm text-text"
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
                    <div className="mt-1">
                      <a
                        href={loginUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                      >
                        Log in to {a.bank ?? "bank"} ↗
                      </a>
                    </div>
                  )}

                  {progress !== null && (
                    <div className="mt-4">
                      <div className="flex items-baseline justify-between text-xs text-text-faint">
                        <span className="tabular">
                          <Money amount={a.balance} /> of{" "}
                          <Money amount={a.goal!} />
                        </span>
                        <span
                          className="tabular font-semibold"
                          style={{ color: progressColor(progress) }}
                        >
                          {progress.toFixed(0)}%
                        </span>
                      </div>
                      <SegmentedProgress
                        pct={progress}
                        overBudget={false}
                        color={progressColor(progress)}
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
                        <span
                          className="tabular font-semibold"
                          style={{ color: progressColor(payoffProgress) }}
                        >
                          {payoffProgress.toFixed(0)}%
                        </span>
                      </div>
                      <SegmentedProgress
                        pct={payoffProgress}
                        overBudget={false}
                        color={progressColor(payoffProgress)}
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

  const [isActive, setIsActive] = useState(a.is_active);

  return (
    <div
      className="animate-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-modal-panel flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-modal"
      >
        <div className="flex h-14 shrink-0 items-center gap-1 border-b border-border px-2">
          <button
            type="button"
            onClick={onClose}
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
            Edit account
          </p>
          {/* Balances the back button so the title stays visually centered. */}
          <span className="size-9 shrink-0" aria-hidden="true" />
        </div>

        <form action={handleSubmit} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
          <div className="flex items-center gap-3">
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
              className="group relative size-14 shrink-0 overflow-hidden rounded-md border border-border bg-white disabled:opacity-70"
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

          <PanelField label="Account name">
            <input
              type="text"
              name="name"
              required
              defaultValue={a.name}
              className={PANEL_FIELD_INPUT_CLASS}
            />
          </PanelField>

          <div className="grid grid-cols-2 gap-3">
            <PanelField label="Bank">
              <Dropdown
                variant="panel"
                name="bank"
                defaultValue={a.bank ?? ""}
                options={bankChoices(bankOptions, "No bank")}
              />
            </PanelField>

            <PanelField label="Account type">
              <Dropdown
                variant="panel"
                name="account_type"
                defaultValue={a.account_type ?? ""}
                options={accountTypeChoices("Unspecified")}
              />
            </PanelField>
          </div>

          <PanelField label="Goal" optional>
            <input
              type="number"
              step="0.01"
              name="goal"
              defaultValue={a.goal ?? ""}
              placeholder="Set a goal"
              className={PANEL_FIELD_INPUT_CLASS}
            />
          </PanelField>

          <PanelField label="Login page URL" optional>
            <input
              type="url"
              name="login_url"
              defaultValue={a.login_url ?? ""}
              placeholder={defaultLoginUrl(a.bank) ?? "Login page URL"}
              className={PANEL_FIELD_INPUT_CLASS}
            />
          </PanelField>

          {/* Summary box — mirrors the reference design's bottom panel
              (total + a toggle) with this account's own on/off settings. */}
          <div className="space-y-0.5 rounded-lg border border-border bg-bg p-1">
            <ToggleRow
              label="Active"
              hint="Shown in account lists and totals"
              name="is_active"
              checked={isActive}
              onChange={setIsActive}
            />
            <ToggleRow
              label="Debt account"
              hint="Loan or credit card — balance means amount owed"
              name="is_debt"
              checked={isDebt}
              onChange={setIsDebt}
            />
            <ToggleRow
              label="Business account"
              hint="Grouped separately on the dashboard"
              name="is_business"
              checked={isBusiness}
              onChange={setIsBusiness}
            />
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3 border-t border-border p-4">
          <SubmitButton pendingText="Saving…">Save</SubmitButton>
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

// A labeled on/off row for the account summary box — same toggle-switch
// look as the "Repeats monthly" row in the transaction panel. Backed by a
// hidden input so the form's plain `formData.get(name) === "on"` read in
// handleSubmit keeps working unchanged.
function ToggleRow({
  label,
  hint,
  name,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  name: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm text-text">{label}</p>
        {hint && <p className="text-xs text-text-faint">{hint}</p>}
      </div>
      <input type="hidden" name={name} value={checked ? "on" : ""} />
      <ToggleSwitch checked={checked} onChange={onChange} label={label} />
    </div>
  );
}
