"use client";

import { useState } from "react";
import Image, { type StaticImageData } from "next/image";
import { Coolicon } from "@/app/(app)/coolicon";
import { CurrencyInput } from "@/app/(app)/currency-input";
import { DatePicker } from "@/app/(app)/date-picker";
import { Money } from "@/app/(app)/money";
import { PanelField } from "@/app/(app)/panel-field";
import { FieldError } from "@/app/(app)/field-error";
import { SegmentedProgress } from "@/app/(app)/segmented-progress";
import { SubmitButton } from "@/app/(app)/submit-button";
import { useToast } from "@/app/(app)/toast";
import { formatDate, formatMoney } from "@/lib/format";
import type { LoanSummary } from "@/lib/loan-math";
import { PANEL_FIELD_INPUT_CLASS } from "@/lib/ui";
import { updateHomeValue, updateLoanFromStatement } from "./loan-actions";
import warriorCourtPhoto from "./home-168-warrior-ct.jpg";

// A photo of the property, keyed by the loan's last four digits.
const HOME_PHOTOS: Record<string, StaticImageData> = {
  "5053": warriorCourtPhoto,
};

function formatMonthYear(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function timeLeft(months: number) {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return [years ? `${years} yr${years === 1 ? "" : "s"}` : null, rest ? `${rest} mo` : null]
    .filter(Boolean)
    .join(" ");
}

// The home mortgage on the Accounts page. Kept out of the account grid — its
// balance comes down as payments are logged, not from an account balance
// edit — but its equity (home value minus this balance) does count toward
// Net Worth once a home value estimate is set; see EquityBlock below.
export function MortgageCard({ summary: s }: { summary: LoanSummary }) {
  const [editing, setEditing] = useState(false);
  const { loan } = s;
  const street = loan.property_address?.split(",")[0] ?? null;
  const meta = [loan.lender, loan.loan_number_last4 ? `Loan ••${loan.loan_number_last4}` : null]
    .filter(Boolean)
    .join(" · ");
  const lastPayment = s.payments[0];
  const photo = loan.loan_number_last4 ? HOME_PHOTOS[loan.loan_number_last4] : undefined;

  return (
    <section>
      <p className="text-section-label mb-3">Home</p>
      <div className="card animate-fade-in-up overflow-hidden p-0">
        {photo && (
          <Image
            src={photo}
            alt={loan.property_address ?? "Home"}
            placeholder="blur"
            sizes="(min-width: 1280px) 400px, (min-width: 1024px) 360px, 100vw"
            className="block h-auto w-full"
          />
        )}
        <div className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          {!photo && (
            <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
              <Coolicon name="House_01" size={22} />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-text">{loan.name}</p>
            {street && <p className="mt-0.5 truncate text-sm text-text-muted">{street}</p>}
            {meta && <p className="mt-0.5 truncate text-xs text-text-faint">{meta}</p>}
            {loan.login_url && (
              <a
                href={loan.login_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
              >
                Log in to {loan.lender ?? "lender"} ↗
              </a>
            )}
          </div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label="Update from statement"
            className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:bg-bg hover:text-text"
          >
            Update
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <p className="text-xs text-text-faint">Principal balance</p>
            <div className="mt-1 flex items-baseline gap-1.5">
              <Money amount={s.balance} variant="balance" className="text-balance-sm text-text" />
              <span className="text-sm text-text-faint">{s.balance > 0 ? "owed" : "paid off"}</span>
            </div>
            <div className="mt-4">
              <div className="flex items-baseline justify-between gap-3 text-xs text-text-faint">
                <span className="tabular">
                  <Money amount={s.paidPrincipal} /> paid of <Money amount={loan.original_balance} />
                </span>
                <span className="tabular font-semibold text-accent">
                  {s.paidOffPct < 10 ? s.paidOffPct.toFixed(1) : s.paidOffPct.toFixed(0)}%
                </span>
              </div>
              <SegmentedProgress pct={s.paidOffPct} overBudget={false} className="mt-1.5 w-full" />
              <p className="mt-2 text-xs text-text-faint">
                Paid off {formatMonthYear(s.payoffDate)} · {timeLeft(s.paymentsRemaining)} left
              </p>
            </div>
          </div>

          <EquityBlock summary={s} />

          <div className="divide-y divide-border border-t border-border">
            <Stat
              label="Interest rate"
              value={`${Number(loan.interest_rate)}%`}
              detail={`${Math.round(s.termMonths / 12)}-year loan`}
            />
          </div>
        </div>

        <p
          className="mt-5 border-t border-border pt-4 text-xs text-text-faint"
          title="Logging a payment lowers the balance by its principal share; the full payment still counts as a budget expense."
        >
          {lastPayment
            ? `Last payment ${formatDate(lastPayment.txn_date)}: ${formatMoney(lastPayment.principal)} to principal.`
            : `Balance as of ${formatDate(loan.balance_as_of)} statement.`}{" "}
          Balance updates as payments are logged
          {s.equity !== null ? "; equity counts toward Net Worth." : "."}
        </p>
        </div>
      </div>

      {editing && <StatementModal summary={s} onClose={() => setEditing(false)} />}
    </section>
  );
}

// Home value has no bank-synced source the way every other balance in this
// app does — someone types in a Zillow estimate or an appraisal, so this is
// a standing "current estimate" rather than a statement anchored to a date.
// Equity (value minus the mortgage balance above) is the one piece of this
// card that counts toward Net Worth; the raw mortgage balance doesn't.
function EquityBlock({ summary: s }: { summary: LoanSummary }) {
  const [editing, setEditing] = useState(false);
  const showToast = useToast();
  const { loan } = s;

  if (editing) {
    return (
      <HomeValueEditor
        loanId={loan.id}
        defaultValue={loan.estimated_home_value ?? undefined}
        defaultPurchaseDate={loan.purchase_date ?? undefined}
        onDone={(saved) => {
          setEditing(false);
          if (saved) showToast("Home value updated");
        }}
      />
    );
  }

  if (s.equity === null) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="w-full rounded-lg border border-dashed border-border px-3 py-2.5 text-left text-sm text-text-muted transition-colors hover:bg-bg"
      >
        + Add your home&apos;s estimated value to see your equity
      </button>
    );
  }

  return (
    <div className="rounded-lg bg-bg px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-text-faint">Home equity</p>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs font-medium text-text-faint transition-colors hover:text-text"
        >
          Edit estimate
        </button>
      </div>
      <Money
        amount={s.equity}
        variant="balance"
        signDisplay="auto"
        tone={s.equity < 0 ? "negative" : undefined}
        className="tabular text-balance-sm mt-0.5 block text-text"
      />
      <p className="tabular mt-0.5 text-xs text-text-faint">
        {formatMoney(Number(loan.estimated_home_value))} value − {formatMoney(s.balance)} owed
      </p>
    </div>
  );
}

function HomeValueEditor({
  loanId,
  defaultValue,
  defaultPurchaseDate,
  onDone,
}: {
  loanId: string;
  defaultValue?: number;
  defaultPurchaseDate?: string;
  onDone: (saved: boolean) => void;
}) {
  const [value, setValue] = useState(defaultValue !== undefined ? String(defaultValue) : "");
  const [purchaseDate, setPurchaseDate] = useState(defaultPurchaseDate ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    const amount = Number(value);
    setSaving(true);
    const result = await updateHomeValue(loanId, amount, purchaseDate || null);
    setSaving(false);
    if (!result.ok) {
      setError(result.error ?? "Couldn't save.");
      return;
    }
    onDone(true);
  }

  return (
    <div className="rounded-lg bg-bg px-3 py-2.5">
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <p className="text-xs text-text-faint">Estimated home value</p>
          <div className="relative mt-1.5">
            <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-text-faint">
              $
            </span>
            <input
              type="number"
              step="1000"
              min="0"
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") onDone(false);
              }}
              className="w-full rounded-md border border-border bg-surface py-1.5 pr-2 pl-6 text-right text-sm text-text outline-none focus:border-accent"
            />
          </div>
        </div>
        <div>
          <p className="text-xs text-text-faint">Purchase date</p>
          <div className="mt-1.5">
            <DatePicker
              variant="compact"
              className="w-full"
              value={purchaseDate}
              onChange={setPurchaseDate}
            />
          </div>
        </div>
      </div>
      {/* Equity only counts toward Net Worth from this date on — no purchase
          date set means it's always counted, since most homes will never
          need this refinement (only relevant when comparing against a month
          before the house was bought). */}
      <p className="mt-1.5 text-xs text-text-faint">
        Equity counts toward Net Worth starting this date. Leave blank to always count it.
      </p>
      <div className="mt-2 flex items-center gap-1.5">
        <button
          type="button"
          disabled={saving}
          onClick={save}
          className="flex size-9 shrink-0 items-center justify-center rounded-lg text-positive-strong transition-colors hover:bg-positive-bg disabled:opacity-60"
          aria-label="Save"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => onDone(false)}
          className="flex size-9 shrink-0 items-center justify-center rounded-lg text-text-faint transition-colors hover:bg-bg"
          aria-label="Cancel"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <FieldError error={error} className="text-xs text-negative" />
    </div>
  );
}

// One row of the stacked detail list: label on the left, figure on the
// right, and its context line underneath on the right.
function Stat({ label, value, detail }: { label: string; value: string; detail: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 last:pb-0">
      <p className="pt-px text-sm text-text-muted">{label}</p>
      <div className="flex min-w-0 flex-col items-end text-right">
        <p className="tabular text-sm font-semibold whitespace-nowrap text-text">{value}</p>
        <div className="tabular mt-0.5 text-xs whitespace-nowrap text-text-faint">{detail}</div>
      </div>
    </div>
  );
}

function StatementModal({ summary: s, onClose }: { summary: LoanSummary; onClose: () => void }) {
  const showToast = useToast();
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    const result = await updateLoanFromStatement(s.loan.id, formData);
    if (!result.ok) {
      setError(result.error ?? "Couldn't save.");
      return;
    }
    showToast("Mortgage updated");
    onClose();
  }

  return (
    <div
      className="animate-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Update mortgage from statement"
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
              <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <p className="card-label min-w-0 flex-1 truncate text-center text-text-muted">Update from statement</p>
          <span className="size-9 shrink-0" aria-hidden="true" />
        </div>

        <form action={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
            <p className="text-sm text-text-muted">
              Copy these from your latest {s.loan.lender ?? "lender"} statement. Payments you log after the
              “as of” date keep lowering the balance from there.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <PanelField label="Principal balance">
                <CurrencyInput
                  name="principal_balance"
                  required
                  defaultValue={s.balance}
                  className={`${PANEL_FIELD_INPUT_CLASS} pl-4`}
                  dollarPosition="left-0"
                />
              </PanelField>
              <PanelField label="Balance as of">
                <DatePicker variant="panel" name="balance_as_of" required defaultValue={s.loan.balance_as_of} />
              </PanelField>
              <PanelField label="Escrow balance" optional>
                <CurrencyInput
                  name="escrow_balance"
                  defaultValue={s.loan.escrow_balance !== null ? Number(s.loan.escrow_balance).toFixed(2) : ""}
                  className={`${PANEL_FIELD_INPUT_CLASS} pl-4`}
                  dollarPosition="left-0"
                />
              </PanelField>
              <PanelField label="Next payment due">
                <DatePicker variant="panel" name="next_payment_due" required defaultValue={s.nextDue} />
              </PanelField>
              <div className="col-span-2">
                <PanelField label="Monthly payment (incl. escrow)">
                  <CurrencyInput
                    name="monthly_payment"
                    required
                    defaultValue={Number(s.loan.monthly_payment).toFixed(2)}
                    className={`${PANEL_FIELD_INPUT_CLASS} pl-4`}
                    dollarPosition="left-0"
                  />
                </PanelField>
              </div>
            </div>
            <FieldError error={error} className="text-sm text-negative" />
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
