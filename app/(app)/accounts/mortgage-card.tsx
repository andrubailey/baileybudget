"use client";

import { useState } from "react";
import { Coolicon } from "@/app/(app)/coolicon";
import { DatePicker } from "@/app/(app)/date-picker";
import { Money } from "@/app/(app)/money";
import { PanelField } from "@/app/(app)/panel-field";
import { SegmentedProgress } from "@/app/(app)/segmented-progress";
import { StatusPill } from "@/app/(app)/status-pill";
import { SubmitButton } from "@/app/(app)/submit-button";
import { useToast } from "@/app/(app)/toast";
import { formatDate, formatMoney } from "@/lib/format";
import type { LoanSummary } from "@/lib/loan-math";
import { PANEL_FIELD_INPUT_CLASS } from "@/lib/ui";
import { updateLoanFromStatement } from "./loan-actions";

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

// The home mortgage on the Accounts page. Kept out of the account grid and
// out of Net Worth on purpose; its balance comes down as payments are logged.
export function MortgageCard({ summary: s }: { summary: LoanSummary }) {
  const [editing, setEditing] = useState(false);
  const { loan } = s;
  const street = loan.property_address?.split(",")[0] ?? null;
  const meta = [loan.lender, loan.loan_number_last4 ? `Loan ••${loan.loan_number_last4}` : null]
    .filter(Boolean)
    .join(" · ");
  const lastPayment = s.payments[0];

  return (
    <section>
      <p className="text-section-label mb-3">Home</p>
      <div className="card animate-fade-in-up">
        <div className="flex items-start gap-3">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
            <Coolicon name="House_01" size={24} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-text">
              {loan.name}
              {street && <span className="font-normal text-text-muted"> · {street}</span>}
            </p>
            {meta && <p className="mt-0.5 truncate text-xs text-text-faint">{meta}</p>}
          </div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label="Update from statement"
            className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:bg-bg hover:text-text"
          >
            <span className="sm:hidden">Update</span>
            <span className="hidden sm:inline">Update from statement</span>
          </button>
        </div>

        <div className="mt-5 space-y-5">
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

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat
              label="Next payment"
              value={formatDate(s.nextDue)}
              detail={
                s.nextDueIsPast ? (
                  <StatusPill variant="warning">Not logged yet</StatusPill>
                ) : (
                  formatMoney(loan.monthly_payment)
                )
              }
            />
            <Stat
              label="Monthly payment"
              value={formatMoney(loan.monthly_payment)}
              detail={`Incl. ${formatMoney(s.escrowPerMonth)} escrow`}
            />
            <Stat
              label="Next payment split"
              value={`${formatMoney(s.nextPayment.principal)} principal`}
              detail={`${formatMoney(s.nextPayment.interest)} interest`}
            />
            <Stat
              label="Interest rate"
              value={`${Number(loan.interest_rate)}%`}
              detail={`${Math.round(s.termMonths / 12)}-year loan`}
            />
            <Stat
              label="Escrow balance"
              value={loan.escrow_balance !== null ? formatMoney(loan.escrow_balance) : "—"}
              detail={`As of ${formatDate(loan.balance_as_of)}`}
            />
            <Stat
              label="Interest left"
              value={formatMoney(s.interestRemaining)}
              detail={`${formatMoney(s.interestPaid)} paid so far`}
            />
          </div>
        </div>

        <p className="mt-5 border-t border-border pt-4 text-xs text-text-faint">
          {lastPayment
            ? `Last payment ${formatDate(lastPayment.txn_date)}: ${formatMoney(lastPayment.principal)} to principal, ${formatMoney(lastPayment.interest)} interest, ${formatMoney(lastPayment.escrow)} escrow. `
            : `Balance is from the statement (payments through ${formatDate(loan.balance_as_of)}). `}
          Logging a{loan.payment_match ? ` “${loan.lender ?? loan.payment_match}”` : ""} payment lowers it automatically;
          the full payment still counts as a budget expense. Not included in Net Worth.
        </p>
      </div>

      {editing && <StatementModal summary={s} onClose={() => setEditing(false)} />}
    </section>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-border p-3">
      <p className="truncate text-xs text-text-faint">{label}</p>
      <p className="tabular mt-1 truncate text-sm font-semibold text-text">{value}</p>
      <div className="tabular mt-0.5 truncate text-xs text-text-faint">{detail}</div>
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
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  name="principal_balance"
                  required
                  defaultValue={s.balance}
                  className={PANEL_FIELD_INPUT_CLASS}
                />
              </PanelField>
              <PanelField label="Balance as of">
                <DatePicker variant="panel" name="balance_as_of" required defaultValue={s.loan.balance_as_of} />
              </PanelField>
              <PanelField label="Escrow balance" optional>
                <input
                  type="number"
                  step="0.01"
                  name="escrow_balance"
                  defaultValue={s.loan.escrow_balance !== null ? Number(s.loan.escrow_balance).toFixed(2) : ""}
                  className={PANEL_FIELD_INPUT_CLASS}
                />
              </PanelField>
              <PanelField label="Next payment due">
                <DatePicker variant="panel" name="next_payment_due" required defaultValue={s.nextDue} />
              </PanelField>
              <div className="col-span-2">
                <PanelField label="Monthly payment (incl. escrow)">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    name="monthly_payment"
                    required
                    defaultValue={Number(s.loan.monthly_payment).toFixed(2)}
                    className={PANEL_FIELD_INPUT_CLASS}
                  />
                </PanelField>
              </div>
            </div>
            {error && <p className="text-sm text-negative">{error}</p>}
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
