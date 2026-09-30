"use client";

import { useMemo, useState } from "react";
import { PageHeader, SectionHeader, Sheet } from "@/components/ui";
import { firstNameFromEmail, formatMoney } from "@/lib/format";
import type { Account, Category, Transaction } from "@/lib/types";
import type { HouseholdMember } from "@/lib/profile";
import { usePendingTransactions } from "@/app/(app)/pending-transactions";
import { ActivityRow } from "./activity-row";
import {
  applyFilter,
  dayHeading,
  filterLabel,
  groupByDay,
  type ActivityFilter,
} from "./activity-filter";

export function ActivityList({
  transactions,
  accounts,
  categories,
  members,
}: {
  transactions: Transaction[];
  accounts: Account[];
  categories: Category[];
  members: HouseholdMember[];
}) {
  const [filter, setFilter] = useState<ActivityFilter>({ kind: "all" });
  const [picking, setPicking] = useState(false);

  // Anything just added from the add sheet shows immediately, marked pending,
  // instead of waiting for the server's revalidated data to arrive.
  const rows = usePendingTransactions(transactions);

  const nameById = useMemo(
    () =>
      new Map(
        members.map((m) => [
          m.id,
          m.displayName?.trim() ||
            (m.email ? firstNameFromEmail(m.email) : "Someone"),
        ]),
      ),
    [members],
  );

  const personName = (id: string) => nameById.get(id) ?? "Someone";
  const filtered = useMemo(() => applyFilter(rows, filter), [rows, filter]);
  const days = useMemo(() => groupByDay(filtered), [filtered]);

  const options: ActivityFilter[] = [
    { kind: "all" },
    { kind: "uncategorized" },
    { kind: "month" },
    ...members.map((m) => ({ kind: "person" as const, id: m.id })),
  ];

  return (
    <>
      <PageHeader
        title="Activity"
        subtitle={`${filtered.length} ${filtered.length === 1 ? "entry" : "entries"}`}
        icon={
          // The single filter control: one button showing what's applied,
          // opening the whole set. A filter bar would take a third of the
          // screen to say "everything" most of the time.
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="ui-pressable flex items-center gap-(--space-2) rounded-(--radius-pill) bg-(--bg-card-subtle) px-(--space-4) py-(--space-2) text-(length:--text-caption) font-medium text-(--text-primary)"
          >
            {filterLabel(filter, personName)}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
            </svg>
          </button>
        }
      />

      {days.length === 0 ? (
        <p className="ui-caption py-(--space-6)">Nothing matches this filter.</p>
      ) : (
        days.map((day) => {
          // Only money that actually left or entered the household counts
          // toward a day's total — a transfer between our own accounts would
          // otherwise read as a day of heavy spending.
          const net = day.transactions.reduce(
            (sum, t) =>
              t.kind === "income"
                ? sum + t.amount
                : t.kind === "expense"
                  ? sum - t.amount
                  : sum,
            0,
          );
          return (
            <section key={day.date}>
              <SectionHeader
                title={
                  <span className="flex items-baseline gap-(--space-2)">
                    {dayHeading(day.date)}
                    <span className="ui-caption ui-tabular font-normal">
                      {net < 0 ? "−" : "+"}
                      {formatMoney(Math.abs(net))}
                    </span>
                  </span>
                }
              />
              <ul>
                {day.transactions.map((t) => (
                  <ActivityRow
                    key={t.id}
                    transaction={t}
                    accounts={accounts}
                    categories={categories}
                    nameById={nameById}
                  />
                ))}
              </ul>
            </section>
          );
        })
      )}

      <Sheet open={picking} onClose={() => setPicking(false)} title="Show">
        <ul>
          {options.map((option) => {
            const label = filterLabel(option, personName);
            const active =
              option.kind === filter.kind &&
              (option.kind !== "person" ||
                (filter.kind === "person" && filter.id === option.id));
            return (
              <li key={`${option.kind}-${option.kind === "person" ? option.id : ""}`}>
                <button
                  type="button"
                  onClick={() => {
                    setFilter(option);
                    setPicking(false);
                  }}
                  aria-current={active}
                  className="ui-pressable flex w-full items-center justify-between gap-(--space-3) border-b border-(--bg-card-subtle) py-(--space-4) text-left last:border-0"
                >
                  <span className="ui-body font-medium text-(--text-primary)">
                    {label}
                  </span>
                  {active && (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
                    </svg>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </Sheet>
    </>
  );
}
