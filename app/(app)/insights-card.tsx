"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { createRecurringFromTransaction } from "@/app/actions";
import { formatMoney } from "@/lib/format";
import { useToast } from "@/app/(app)/toast";
import { CategoryChip } from "@/app/(app)/category-chip";
import type { CategoryAnomaly, UndeclaredRecurringGroup } from "@/lib/queries";

const DISMISSED_KEY = "insights-dismissed";

// Includes the numbers that made it flag-worthy, not just the category id —
// a dismissed anomaly stays gone while its underlying number is unchanged,
// but a materially different actual (a new month, a bigger jump) is a new
// insight and reappears rather than staying silently suppressed forever.
function anomalySignature(a: CategoryAnomaly) {
  return `anomaly:${a.categoryId}:${Math.round(a.actual)}`;
}
function recurringSignature(g: UndeclaredRecurringGroup) {
  return `recurring:${g.key}:${g.occurrenceCount}:${Math.round(g.lastAmount)}`;
}

function DismissButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      aria-label={label}
      className="-m-1.5 flex size-7 shrink-0 items-center justify-center rounded-md text-text-faint transition-colors hover:bg-bg hover:text-text"
    >
      ✕
    </button>
  );
}

// Two answers the data already had but nothing surfaced: which categories
// are running unusually high against their OWN recent history (not a static
// budget number someone typed in once), and which merchants have quietly
// become monthly without anyone ever checking "make this recurring." Each
// row can be dismissed on its own — dismissals persist (by signature, so a
// changed number counts as a new insight) — and the whole card disappears
// once every insight is either dismissed or resolved by the data itself.
export function InsightsCard({
  anomalies,
  undeclaredRecurring,
}: {
  anomalies: CategoryAnomaly[];
  undeclaredRecurring: UndeclaredRecurringGroup[];
}) {
  // null until the localStorage read resolves after mount — treated as "no
  // dismissals yet" for rendering, so the server-rendered markup and the
  // first client render match (no dismissal state exists on the server).
  const [dismissed, setDismissed] = useState<Set<string> | null>(null);

  useEffect(() => {
    let stored: string[] = [];
    try {
      stored = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "[]");
    } catch {
      stored = [];
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing with localStorage, an external system, after mount
    setDismissed(new Set(stored));
  }, []);

  function dismiss(signature: string) {
    setDismissed((current) => {
      const next = new Set(current);
      next.add(signature);
      try {
        localStorage.setItem(DISMISSED_KEY, JSON.stringify([...next]));
      } catch {
        // ignore — localStorage unavailable
      }
      return next;
    });
  }

  const visibleAnomalies = anomalies.filter((a) => !dismissed?.has(anomalySignature(a)));
  const visibleRecurring = undeclaredRecurring.filter(
    (g) => !dismissed?.has(recurringSignature(g)),
  );

  if (visibleAnomalies.length === 0 && visibleRecurring.length === 0) return null;

  return (
    <div className="card animate-fade-in-up">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-heading text-text">Insights</h2>
      </div>

      <div className="space-y-5">
        {visibleAnomalies.length > 0 && (
          <div>
            <p className="card-label mb-2 text-text-faint">Running high this month</p>
            <ul className="divide-y divide-border">
              {visibleAnomalies.map((a) => (
                <li key={a.categoryId} className="flex items-center gap-1">
                  <Link
                    href={`/transactions?category=${a.categoryId}`}
                    className="-ml-2 flex min-w-0 flex-1 items-center justify-between gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-bg"
                  >
                    <CategoryChip id={a.categoryId} name={a.name} icon={a.icon} className="min-w-0" />
                    <span className="shrink-0 text-right text-sm">
                      <span className="tabular font-semibold text-negative">
                        {formatMoney(a.actual)}
                      </span>
                      <span className="text-text-faint"> · +{a.pctAboveAverage}% vs usual</span>
                    </span>
                  </Link>
                  <DismissButton
                    onClick={() => dismiss(anomalySignature(a))}
                    label={`Dismiss ${a.name} insight`}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}

        {visibleRecurring.length > 0 && (
          <div>
            <p className="card-label mb-2 text-text-faint">
              Charging you regularly, not marked recurring
            </p>
            <ul className="divide-y divide-border">
              {visibleRecurring.map((g) => (
                <RecurringCandidateRow
                  key={g.key}
                  group={g}
                  onDismiss={() => dismiss(recurringSignature(g))}
                />
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function RecurringCandidateRow({
  group,
  onDismiss,
}: {
  group: UndeclaredRecurringGroup;
  onDismiss: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [marked, setMarked] = useState(false);
  const showToast = useToast();

  // Hides itself the moment it's successfully marked recurring — from then
  // on the underlying transaction has a recurring_transaction_id, so the
  // query itself won't surface it again on the next load either.
  if (marked) return null;

  function markRecurring() {
    startTransition(async () => {
      const result = await createRecurringFromTransaction(group.lastTransactionId);
      if (!result.ok) {
        showToast(
          result.error ? `Couldn't set up recurring: ${result.error}` : "Couldn't set up recurring",
        );
        return;
      }
      setMarked(true);
      showToast(`${group.description} marked recurring`);
    });
  }

  return (
    <li className="flex items-center gap-1 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text">{group.description}</p>
        <p className="text-metadata">
          {group.occurrenceCount} months in a row · ~{formatMoney(group.averageAmount)}
        </p>
      </div>
      <button
        type="button"
        onClick={markRecurring}
        disabled={isPending}
        className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-text-muted transition-colors hover:bg-bg hover:text-text disabled:opacity-50"
      >
        Mark recurring
      </button>
      <DismissButton onClick={onDismiss} label={`Dismiss ${group.description} insight`} />
    </li>
  );
}
