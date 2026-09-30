"use client";

import { useEffect, useMemo, useState } from "react";
import { Sheet, StatusPill } from "@/components/ui";
import { useToast } from "@/app/(app)/toast";
import { formatDate, formatMoney, formatRelativeTime } from "@/lib/format";
import type { AccountWithBalance } from "@/lib/queries";
import {
  loadReconcileContext,
  recordReconciliation,
  updateAccountMask,
  type ReconcileContext,
} from "./reconcile-actions";

function sanitizeAmount(input: string): string {
  // A bank balance can be negative (an overdrawn account, a card you owe on),
  // so a leading minus survives; everything else is digits and one dot.
  const negative = input.trim().startsWith("-");
  let cleaned = input.replace(/[^\d.]/g, "");
  const firstDot = cleaned.indexOf(".");
  if (firstDot !== -1) {
    cleaned =
      cleaned.slice(0, firstDot + 1) +
      cleaned.slice(firstDot + 1).replace(/\./g, "");
  }
  const [whole, decimals] = cleaned.split(".");
  const trimmed = decimals === undefined ? whole : `${whole}.${decimals.slice(0, 2)}`;
  return negative ? `-${trimmed}` : trimmed;
}

// Reconcile against the bank app. They do this by hand, so the flow is built
// around the one question that matters — does the number in the bank app match
// the number here — and then, when it doesn't, around finding the entry that
// explains the gap rather than papering over it.
export function ReconcileModal({
  account,
  onClose,
}: {
  account: AccountWithBalance;
  onClose: () => void;
}) {
  const showToast = useToast();
  const [open, setOpen] = useState(true);
  const [context, setContext] = useState<ReconcileContext | null>(null);
  const [raw, setRaw] = useState("");
  const [note, setNote] = useState("");
  // Recorded here because this is the one moment the bank app is already open
  // in the other hand — asking for it anywhere else means going to look it up.
  const [mask, setMask] = useState(account.account_mask ?? "");
  const [saving, setSaving] = useState(false);
  const [hunting, setHunting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadReconcileContext(account.id)
      .then((loaded) => {
        if (!cancelled) setContext(loaded);
      })
      .catch(() => {
        if (!cancelled) showToast("Couldn't load this account's reconcile history");
      });
    return () => {
      cancelled = true;
    };
  }, [account.id, showToast]);

  // The balance the sheet compares against comes from the same computation the
  // Accounts list used, refreshed on open — reconciling against a figure that
  // went stale while the sheet sat open would invent a gap.
  const computed = context?.computedBalance ?? account.balance;
  const entered = raw === "" || raw === "-" ? null : Number(raw);
  const difference =
    entered === null ? null : Math.round((entered - computed) * 100) / 100;
  const matches = difference === 0;

  // A single transaction whose own amount is exactly the gap is almost always
  // the answer: it was logged twice, logged on the wrong account, or logged
  // when it never happened.
  const culprits = useMemo(() => {
    if (!difference || !context) return [];
    return context.candidates.filter(
      (c) => Math.abs(Math.abs(c.signedAmount) - Math.abs(difference)) < 0.005,
    );
  }, [difference, context]);

  function close() {
    setOpen(false);
    setTimeout(onClose, 200);
  }

  async function submit(applyAdjustment: boolean) {
    if (entered === null || difference === null || saving) return;
    setSaving(true);
    const trimmedMask = mask.replace(/\D/g, "").slice(-4);
    if (trimmedMask !== (account.account_mask ?? "")) {
      // Best-effort: the reconcile itself is what matters, and failing to save
      // four cosmetic digits shouldn't lose the balance check.
      await updateAccountMask(account.id, trimmedMask).catch(() => {});
    }
    const result = await recordReconciliation({
      accountId: account.id,
      statementBalance: entered,
      applyAdjustment,
      note,
    });
    setSaving(false);
    if (!result.ok) {
      showToast(result.error ? `Couldn't save: ${result.error}` : "Couldn't save");
      return;
    }
    showToast(
      matches
        ? "Balance confirmed"
        : applyAdjustment
          ? `Adjusted by ${formatMoney(Math.abs(difference))}`
          : `Noted a ${formatMoney(Math.abs(difference))} gap — balance left as it was`,
    );
    close();
  }

  const lastConfirmed = context?.lastReconciledAt ?? account.balance_checked_at;

  return (
    <Sheet
      open={open}
      onClose={close}
      title={`Reconcile ${account.name}`}
      footer={
        entered === null ? (
          <p className="ui-caption text-center">
            Enter the balance your bank app shows.
          </p>
        ) : matches ? (
          <button
            type="button"
            onClick={() => void submit(false)}
            disabled={saving}
            className="ui-pressable w-full rounded-(--radius-field) bg-(--text-primary) px-(--space-4) py-(--space-4) text-(length:--text-body) font-semibold text-(--bg-card) disabled:opacity-50"
          >
            {saving ? "Saving…" : "Confirm this balance"}
          </button>
        ) : (
          <div className="flex flex-col gap-(--space-2)">
            <button
              type="button"
              onClick={() => void submit(true)}
              disabled={saving}
              className="ui-pressable w-full rounded-(--radius-field) bg-(--text-primary) px-(--space-4) py-(--space-4) text-(length:--text-body) font-semibold text-(--bg-card) disabled:opacity-50"
            >
              {saving
                ? "Saving…"
                : `Log a ${formatMoney(Math.abs(difference!))} adjustment`}
            </button>
            <button
              type="button"
              onClick={() => void submit(false)}
              disabled={saving}
              className="ui-pressable w-full rounded-(--radius-field) px-(--space-4) py-(--space-3) text-(length:--text-caption) font-medium text-(--text-secondary) disabled:opacity-50"
            >
              Leave the gap open — I&apos;ll find it
            </button>
          </div>
        )
      }
    >
      {/* What the app believes, and how much that belief is worth. A balance
          nobody has checked in a week is not evidence. */}
      <div className="rounded-(--radius-card) bg-(--bg-card-subtle) px-(--space-4) py-(--space-4)">
        <p className="ui-label">This app computes</p>
        <p className="ui-title ui-tabular pt-(--space-1)">{formatMoney(computed)}</p>
        <p className="ui-caption pt-(--space-1)">
          {lastConfirmed
            ? `Last confirmed ${formatRelativeTime(lastConfirmed)}`
            : "Never confirmed against the bank"}
        </p>
      </div>

      <label className="block pt-(--space-5)">
        <span className="ui-label block pb-(--space-2)">
          What your bank app shows right now
        </span>
        <span className="flex items-center gap-(--space-2) rounded-(--radius-field) bg-(--bg-card-subtle) px-(--space-4) py-(--space-3)">
          <span className="ui-title text-(--text-tertiary)">$</span>
          <input
            type="text"
            inputMode="decimal"
            enterKeyHint="done"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            autoFocus
            placeholder="0.00"
            value={raw}
            onChange={(e) => setRaw(sanitizeAmount(e.target.value))}
            className="ui-title ui-tabular w-full min-w-0 border-0 bg-transparent p-0 text-(--text-primary) outline-none placeholder:text-(--text-tertiary)"
          />
        </span>
      </label>

      {/* The gap, the instant there's enough typed to compute one. */}
      {difference !== null && (
        <div className="pt-(--space-4)">
          {matches ? (
            <div className="flex items-center gap-(--space-2)">
              <StatusPill tone="positive">Matches</StatusPill>
              <p className="ui-caption">Nothing is missing.</p>
            </div>
          ) : (
            <>
              <div className="flex items-baseline justify-between gap-(--space-3)">
                <p className="ui-label">Gap</p>
                <p
                  className={`ui-title ui-tabular ${
                    difference > 0
                      ? "text-(--accent-positive)"
                      : "text-(--accent-caution)"
                  }`}
                >
                  {difference > 0 ? "+" : "−"}
                  {formatMoney(Math.abs(difference))}
                </p>
              </div>
              <p className="ui-caption pt-(--space-1)">
                {difference > 0
                  ? "The bank has more than this app does — something received was never logged, or an expense here never happened."
                  : "The bank has less than this app does — something spent was never logged, or an entry here is duplicated."}
              </p>
            </>
          )}
        </div>
      )}

      {difference !== null && !matches && (
        <>
          {culprits.length > 0 && (
            <div className="mt-(--space-4) rounded-(--radius-card) bg-(--bg-card-subtle) px-(--space-4) py-(--space-3)">
              <p className="ui-label pb-(--space-1)">
                {culprits.length === 1 ? "This one is exactly the gap" : "These are exactly the gap"}
              </p>
              {culprits.map((c) => (
                <p key={c.id} className="ui-caption ui-tabular">
                  {formatDate(c.txnDate)} · {c.description} ·{" "}
                  {formatMoney(c.signedAmount)}
                </p>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => setHunting((v) => !v)}
            aria-expanded={hunting}
            className="ui-pressable mt-(--space-4) flex w-full items-center justify-between gap-(--space-3) rounded-(--radius-field) bg-(--bg-card-subtle) px-(--space-4) py-(--space-3) text-left"
          >
            <span className="ui-body font-medium text-(--text-primary)">
              {context
                ? `${context.candidates.length} ${context.candidates.length === 1 ? "transaction" : "transactions"} since the last check`
                : "Loading transactions…"}
            </span>
            <span className="ui-caption">{hunting ? "Hide" : "Show"}</span>
          </button>

          {hunting && context && (
            <ul className="pt-(--space-2)">
              {context.candidates.length === 0 && (
                <li className="ui-caption py-(--space-3)">
                  Nothing has been logged on this account since the last check —
                  so whatever the bank has, this app never saw it.
                </li>
              )}
              {context.candidates.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center gap-(--space-3) border-b border-(--bg-card-subtle) py-(--space-3) last:border-0"
                >
                  <span className="min-w-0 flex-1">
                    <span className="ui-body block truncate font-medium text-(--text-primary)">
                      {c.description}
                    </span>
                    <span className="ui-caption block truncate">
                      {formatDate(c.txnDate)}
                      {c.categoryName ? ` · ${c.categoryName}` : ""}
                    </span>
                  </span>
                  <span className="ui-body ui-tabular shrink-0 font-semibold text-(--text-primary)">
                    {formatMoney(c.signedAmount)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <label className="block pt-(--space-4)">
            <span className="ui-label block pb-(--space-2)">
              Note (what you think happened)
            </span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="ATM fee we never log"
              autoCapitalize="sentences"
              autoComplete="off"
              enterKeyHint="done"
              className="w-full rounded-(--radius-field) bg-(--bg-card-subtle) px-(--space-4) py-(--space-3) text-(length:--text-body) text-(--text-primary) outline-none placeholder:text-(--text-tertiary)"
            />
          </label>
        </>
      )}

      {!account.account_mask && (
        <label className="block pt-(--space-5)">
          <span className="ui-label block pb-(--space-2)">
            Last 4 digits (so this row matches your bank app)
          </span>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            placeholder="1234"
            value={mask}
            onChange={(e) => setMask(e.target.value.replace(/\D/g, "").slice(0, 4))}
            className="ui-tabular w-full rounded-(--radius-field) bg-(--bg-card-subtle) px-(--space-4) py-(--space-3) text-(length:--text-body) text-(--text-primary) outline-none placeholder:text-(--text-tertiary)"
          />
        </label>
      )}

      {context && context.history.length > 0 && (
        <div className="pt-(--space-6)">
          <p className="ui-label pb-(--space-2)">Past checks</p>
          {context.history.slice(0, 5).map((r) => (
            <p key={r.id} className="ui-caption ui-tabular py-(--space-1)">
              {formatRelativeTime(r.reconciled_at)} ·{" "}
              {r.resolution === "matched"
                ? "matched"
                : r.resolution === "adjusted"
                  ? `adjusted ${formatMoney(r.adjustment_amount)}`
                  : `${formatMoney(r.difference)} left open`}
              {r.note ? ` · ${r.note}` : ""}
            </p>
          ))}
        </div>
      )}
    </Sheet>
  );
}
