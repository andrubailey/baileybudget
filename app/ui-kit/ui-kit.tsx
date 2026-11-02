"use client";

import { useRef, useState } from "react";
import {
  Avatar,
  BottomNav,
  HeroCard,
  PageHeader,
  ProgressRow,
  Row,
  Screen,
  SectionHeader,
  Sheet,
  StatusPill,
  useKeyboardInset,
} from "@/components/ui";

export function UiKit() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState("");
  const amountRef = useRef<HTMLInputElement>(null);
  const inset = useKeyboardInset();

  return (
    <>
      <Screen>
        <PageHeader
          title="UI kit"
          subtitle="Every shell component, for checking on a phone."
          icon={<Avatar initial="A" label="Andru" />}
        />
        <HeroCard
          label="Left to spend"
          value={loading ? null : 1234.56}
          caption="You're on pace to finish the month with room to spare."
          status={{ label: "On track", tone: "positive" }}
        >
          <div className="ui-progress-track">
            <div className="ui-progress-fill" style={{ background: "var(--accent-positive)", transform: "scaleX(0.62)" }} />
          </div>
        </HeroCard>

        <SectionHeader title="Budget" action={{ label: "See all", onPress: () => setLoading((v) => !v) }} />
        <ProgressRow name="Groceries" spent={612} limit={800} />
        <ProgressRow name="Restaurants" spent={290} limit={300} caption="On pace to go over" />
        <ProgressRow name="Gas" spent={40} limit={0} tone="neutral" />

        <SectionHeader title="Activity" />
        <Row leading={<Avatar initial="G" label="Geralyn" />} title="Publix" subtitle="Groceries · Today" value={-48.12} />
        <Row leading={<Avatar initial="A" label="Andru" />} title="Client payment" subtitle="Income · Yesterday" value={2500} valueCaption="Business" />

        <SectionHeader title="Pills" />
        <div className="flex gap-(--space-2)">
          <StatusPill tone="positive">Under</StatusPill>
          <StatusPill tone="caution">Close</StatusPill>
          <StatusPill>Pending</StatusPill>
        </div>

        <SectionHeader title="Keyboard" />
        <p className="ui-caption">Keyboard inset: {inset}px</p>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="ui-pressable mt-(--space-3) w-full rounded-(--radius-field) bg-(--text-primary) py-(--space-3) font-semibold text-(--bg-card)"
        >
          Open sheet
        </button>
        {Array.from({ length: 12 }, (_, i) => (
          <Row key={i} title={`Filler row ${i + 1}`} value={i * 10.5} />
        ))}
      </Screen>

      <BottomNav onAdd={() => setSheetOpen(true)} addKeyboard="decimal" />

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Add expense"
        initialFocus={amountRef}
        footer={
          <button
            type="button"
            onClick={() => setSheetOpen(false)}
            className="ui-pressable w-full rounded-(--radius-field) bg-(--text-primary) py-(--space-3) font-semibold text-(--bg-card)"
          >
            Save
          </button>
        }
      >
        <label className="block">
          <span className="ui-label">Amount</span>
          <input
            ref={amountRef}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
            className="mt-(--space-1) w-full rounded-(--radius-field) border border-(--border-subtle) bg-(--bg-page) px-(--space-3) py-(--space-3) text-(length:--text-body)"
          />
        </label>
        {Array.from({ length: 6 }, (_, i) => (
          <p key={i} className="ui-caption mt-(--space-3)">
            Spacer paragraph {i + 1} to make the sheet body scroll.
          </p>
        ))}
        <label className="mt-(--space-4) block">
          <span className="ui-label">Note</span>
          <input
            placeholder="What was it for?"
            className="mt-(--space-1) w-full rounded-(--radius-field) border border-(--border-subtle) bg-(--bg-page) px-(--space-3) py-(--space-3) text-(length:--text-body)"
          />
        </label>
      </Sheet>
    </>
  );
}
