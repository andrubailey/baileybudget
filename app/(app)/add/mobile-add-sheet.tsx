"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import { createTransaction, createTransfer } from "@/app/actions";
import { Avatar, Sheet } from "@/components/ui";
import type { Account, Category } from "@/lib/types";
import type { MerchantSuggestion } from "@/lib/queries";
import type { HouseholdMember } from "@/lib/profile";
import { loadAddSheetData, type AddSheetData } from "./add-data";
import { useToast } from "@/app/(app)/toast";
import {
  announcePendingTransaction,
  markPendingQueued,
  withdrawPendingTransaction,
} from "@/app/(app)/pending-transactions";
import { enqueueJob, formDataToFields } from "@/lib/offline-queue";
import { clearDraft, loadDraft, saveDraft, type AddDraft } from "./add-draft";

type Kind = "expense" | "transfer" | "income";

const TYPES: { key: Kind; label: string }[] = [
  { key: "expense", label: "Expense" },
  { key: "transfer", label: "Transfer" },
  { key: "income", label: "Income" },
];

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function sanitizeAmount(input: string): string {
  let cleaned = input.replace(/[^\d.]/g, "");
  const firstDot = cleaned.indexOf(".");
  if (firstDot !== -1) {
    cleaned =
      cleaned.slice(0, firstDot + 1) +
      cleaned.slice(firstDot + 1).replace(/\./g, "");
  }
  // Cents only — a third decimal is always a typo, and silently keeping it
  // rounds the saved amount away from what's on screen.
  const [whole, decimals] = cleaned.split(".");
  return decimals === undefined ? whole : `${whole}.${decimals.slice(0, 2)}`;
}

function formatAmountDisplay(raw: string): string {
  if (!raw) return "";
  const [intPart, decPart] = raw.split(".");
  const withCommas = (intPart || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return decPart !== undefined ? `${withCommas}.${decPart}` : withCommas;
}

function personLabel(member: HouseholdMember): string {
  return member.displayName?.trim() || member.email?.split("@")[0] || "Someone";
}

// A chip: the one-tap unit this whole screen is built out of. Selected chips
// invert, so the current account/category/date is readable at a glance
// without a label above each row.
function Chip({
  children,
  selected,
  onPress,
  ariaLabel,
}: {
  children: React.ReactNode;
  selected?: boolean;
  onPress: () => void;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      aria-pressed={selected}
      aria-label={ariaLabel}
      className={`ui-pressable shrink-0 rounded-(--radius-pill) px-(--space-4) py-(--space-2) text-(length:--text-caption) font-medium whitespace-nowrap ${
        selected
          ? "bg-(--text-primary) text-(--bg-card)"
          : "bg-(--bg-card-subtle) text-(--text-primary)"
      }`}
    >
      {children}
    </button>
  );
}

// A horizontally scrolling chip row. Bleeds into the sheet's side padding so
// the row reads as scrollable rather than as a clipped list.
function ChipRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mx-(--space-4) overflow-x-auto px-(--space-4) [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex gap-(--space-2)">{children}</div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <p className="ui-label pt-(--space-4) pb-(--space-2)">{children}</p>;
}

// One sheet, three types, amount first. Every field below the amount is a
// one-tap chip rather than a dropdown, because the target is a typical expense
// logged in under five seconds: tap Add, type the number, tap the merchant you
// were always going to tap, submit. Everything heavier — splits, duplicate
// detection, recurring rules, approvals — stays on desktop.
type AddSheetProps = {
  periodId: string;
  accounts: Account[];
  categories: Category[];
  // Set when opened in place as a modal. Without it — the standalone /add
  // page — closing goes back instead.
  onClose?: () => void;
};

const noopSubscribe = () => () => {};

// The saved draft has to be in place before the first field renders, not
// applied afterward — restoring it from an effect would mean a frame of empty
// inputs and a cascade of state updates. So the body only mounts on the client,
// where localStorage exists, and reads the draft straight into its initial
// state. Nothing renders on the server, which is also what <Sheet> does.
export function MobileAddSheet(props: AddSheetProps) {
  const isClient = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [draft] = useState<Partial<AddDraft> | null>(() => loadDraft());
  if (!isClient) return null;
  return <AddSheetBody {...props} draft={draft} />;
}

function AddSheetBody({
  periodId,
  accounts,
  categories,
  onClose,
  draft,
}: AddSheetProps & { draft: Partial<AddDraft> | null }) {
  const router = useRouter();
  const showToast = useToast();
  const today = isoDaysAgo(0);
  const yesterday = isoDaysAgo(1);

  // Merchant chips, household members and the period list, fetched on open —
  // see loadAddSheetData for why they aren't props.
  const [data, setData] = useState<AddSheetData | null>(null);
  // Stable identities, so the memos below don't recompute on every render
  // while the fetch is still outstanding.
  const merchants: MerchantSuggestion[] = useMemo(
    () => data?.merchants ?? [],
    [data],
  );
  const members: HouseholdMember[] = useMemo(() => data?.members ?? [], [data]);

  const [open, setOpen] = useState(true);
  const [type, setType] = useState<Kind>(draft?.type ?? "expense");
  const [rawAmount, setRawAmount] = useState(draft?.rawAmount ?? "");
  const [description, setDescription] = useState(draft?.description ?? "");
  const [accountId, setAccountId] = useState(
    draft?.accountId ?? accounts[0]?.id ?? "",
  );
  const [toAccountId, setToAccountId] = useState(draft?.toAccountId ?? "");
  const [categoryId, setCategoryId] = useState(draft?.categoryId ?? "");
  const [date, setDate] = useState(draft?.date ?? today);
  // Empty until the fetch lands, then defaults to whoever is signed in
  // (unless the restored draft already named someone).
  const [loggedBy, setLoggedBy] = useState(draft?.loggedBy ?? "");
  const [saving, setSaving] = useState(false);
  // Set once the category is chosen by hand, so prediction stops overriding
  // a deliberate choice on the next keystroke.
  const [categoryPinned, setCategoryPinned] = useState(
    Boolean(draft?.categoryId),
  );
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    loadAddSheetData()
      .then((loaded) => {
        if (cancelled) return;
        setData(loaded);
        // Don't overwrite a person a restored draft already chose.
        setLoggedBy((current) => current || loaded.currentUserId || "");
      })
      .catch(() => {
        // Offline, or the read failed. The sheet still saves — it just opens
        // without chips and without the person switcher.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Mirror every keystroke, so a backgrounded app doesn't lose a half-typed
  // entry. See add-draft.ts.
  useEffect(() => {
    saveDraft({
      type,
      rawAmount,
      description,
      accountId,
      toAccountId,
      categoryId,
      date,
      loggedBy,
    });
  }, [
    type,
    rawAmount,
    description,
    accountId,
    toAccountId,
    categoryId,
    date,
    loggedBy,
  ]);

  // The keypad should already be up when the sheet settles. <Sheet> focuses
  // its own panel in an effect, and a parent's effect runs after its
  // children's — so focusing the amount field from a plain child effect would
  // immediately be undone. Deferring past that frame is what makes it stick.
  useEffect(() => {
    const timer = setTimeout(() => {
      amountRef.current?.focus({ preventScroll: true });
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const kindCategories = useMemo(
    () =>
      categories.filter(
        (c) => c.kind === (type === "income" ? "income" : "expense"),
      ),
    [categories, type],
  );

  // Merchant -> category, from the same history that feeds the chips, so a
  // typed-out name predicts just as well as a tapped chip.
  const predictedCategoryId = useMemo(() => {
    const typed = description.trim().toLowerCase();
    if (!typed) return "";
    const exact = merchants.find((m) => m.description.toLowerCase() === typed);
    const prefix =
      exact ??
      merchants.find((m) => m.description.toLowerCase().startsWith(typed));
    return prefix?.categoryId ?? "";
  }, [description, merchants]);

  const effectiveCategoryId =
    categoryPinned || !predictedCategoryId ? categoryId : predictedCategoryId;

  // Predicted category first, so the one-tap override is a tap on a chip
  // that's already in front of you rather than a scroll to find it.
  const orderedCategories = useMemo(() => {
    if (!effectiveCategoryId) return kindCategories;
    const chosen = kindCategories.find((c) => c.id === effectiveCategoryId);
    if (!chosen) return kindCategories;
    return [chosen, ...kindCategories.filter((c) => c.id !== chosen.id)];
  }, [kindCategories, effectiveCategoryId]);

  const selectedAccount = accounts.find((a) => a.id === accountId);
  const isDebtAccount = selectedAccount?.is_debt ?? false;
  // Same relabeling the desktop forms do: a charge on a credit card is stored
  // as kind "income" (it increases what's owed), a payment as "expense" — the
  // sheet always speaks in "charge"/"payment" for a debt account rather than
  // making anyone translate that themselves.
  const effectiveKind: "income" | "expense" =
    type === "transfer"
      ? "expense"
      : isDebtAccount
        ? type === "expense"
          ? "income"
          : "expense"
        : type;
  const actionWord = isDebtAccount
    ? type === "expense"
      ? "charge"
      : "payment"
    : type;

  // A transaction dated yesterday can belong to last month's period, and
  // filing it under the current one would quietly distort both months'
  // totals. Falls back to the period the page picked when the date is
  // outside every known period.
  const resolvedPeriodId =
    data?.periods.find((p) => p.start_date <= date && p.end_date >= date)?.id ??
    periodId;

  const author = members.find((m) => m.id === loggedBy) ?? null;
  const authorName = author ? personLabel(author) : "Me";

  function cycleAuthor() {
    if (members.length < 2) return;
    const index = members.findIndex((m) => m.id === loggedBy);
    const next = members[(index + 1) % members.length];
    setLoggedBy(next.id);
  }

  function pickMerchant(m: MerchantSuggestion) {
    setDescription(m.description);
    // Only reuse a remembered category or account that still exists — a
    // category since deleted, or an account since deactivated, would otherwise
    // silently clear the selection the chip was supposed to fill in.
    const knownCategory =
      m.categoryId && kindCategories.some((c) => c.id === m.categoryId)
        ? m.categoryId
        : "";
    setCategoryId(knownCategory);
    setCategoryPinned(Boolean(knownCategory));
    if (m.accountId && accounts.some((a) => a.id === m.accountId)) {
      setAccountId(m.accountId);
    }
    // The amount is the only thing a repeat entry still needs, so focus goes
    // straight back to it.
    amountRef.current?.focus({ preventScroll: true });
  }

  function close() {
    setOpen(false);
    // Long enough for the sheet's slide-out to read, short enough not to feel
    // like a hang. The draft is deliberately left in place: closing without
    // saving is exactly when someone is most likely to come back.
    setTimeout(() => {
      if (onClose) onClose();
      else router.back();
    }, 200);
  }

  async function handleSubmit() {
    if (saving) return;
    const amount = Number(rawAmount || 0);
    if (!amount) {
      showToast("Enter an amount");
      amountRef.current?.focus();
      return;
    }
    if (!accountId) {
      showToast(type === "transfer" ? "Pick both accounts" : "Pick an account");
      return;
    }
    if (type === "transfer" && (!toAccountId || toAccountId === accountId)) {
      showToast("Pick two different accounts");
      return;
    }

    setSaving(true);
    const isTransfer = type === "transfer";
    const label =
      description.trim() ||
      (isTransfer ? "Transfer" : type === "income" ? "Income" : "Expense");

    const pendingId = announcePendingTransaction({
      kind: isTransfer ? "transfer" : effectiveKind,
      description: label,
      amount,
      txn_date: date,
      account_id: accountId,
      to_account_id: isTransfer ? toAccountId : null,
      category_id: isTransfer ? null : effectiveCategoryId || null,
      period_id: resolvedPeriodId,
      notes: null,
      created_by_email: author?.email ?? null,
    });

    const fd = new FormData();
    fd.set("amount", String(amount));
    fd.set("txn_date", date);
    fd.set("period_id", resolvedPeriodId);
    if (loggedBy) fd.set("logged_by", loggedBy);
    if (isTransfer) {
      fd.set("from_account_id", accountId);
      fd.set("to_account_id", toAccountId);
    } else {
      fd.set("kind", effectiveKind);
      fd.set("description", label);
      fd.set("account_id", accountId);
      fd.set("category_id", effectiveCategoryId);
    }

    try {
      const result = isTransfer
        ? await createTransfer(fd)
        : await createTransaction(fd);
      if (!result.ok) {
        withdrawPendingTransaction(pendingId);
        setSaving(false);
        showToast(result.error ? `Couldn't save: ${result.error}` : "Couldn't save");
        return;
      }
      showToast(
        isTransfer
          ? "Transfer logged"
          : `${actionWord[0].toUpperCase()}${actionWord.slice(1)} logged`,
      );
    } catch {
      // The request never reached the server (no connection) — different from
      // the server rejecting it above, and not something retyping would fix,
      // so it's staged to send on its own instead of being discarded.
      enqueueJob({
        id: pendingId,
        kind: isTransfer ? "transfer" : "transaction",
        pendingId,
        fields: formDataToFields(fd),
        label,
      });
      markPendingQueued(pendingId);
      showToast("No connection — saved, will send automatically.");
    }

    // Only a save that actually landed (or got queued) retires the draft.
    clearDraft();
    close();
  }

  return (
    <Sheet
      open={open}
      onClose={close}
      title={type === "transfer" ? "New transfer" : `New ${actionWord}`}
      footer={
        <button
          type="submit"
          form="mobile-add-form"
          disabled={saving}
          className="ui-pressable w-full rounded-(--radius-field) bg-(--text-primary) px-(--space-4) py-(--space-4) text-(length:--text-body) font-semibold text-(--bg-card) disabled:opacity-50"
        >
          {saving
            ? "Saving…"
            : `Add ${type === "transfer" ? "transfer" : actionWord}`}
        </button>
      }
    >
      <form
        id="mobile-add-form"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSubmit();
        }}
      >
        <div role="tablist" aria-label="Transaction type" className="flex gap-(--space-1) rounded-(--radius-pill) bg-(--bg-card-subtle) p-(--space-1)">
          {TYPES.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={type === t.key}
              onClick={() => setType(t.key)}
              className={`ui-pressable flex-1 rounded-(--radius-pill) py-(--space-2) text-(length:--text-caption) font-semibold ${
                type === t.key
                  ? "bg-(--bg-card) text-(--text-primary) shadow-card"
                  : "text-(--text-secondary)"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Amount, first and largest. The whole row is the label, so tapping
            anywhere near the figure brings the keypad back. */}
        <label className="flex items-center justify-center gap-(--space-1) py-(--space-6)">
          <span className="sr-only">Amount</span>
          <span className="ui-display text-(--text-tertiary)">$</span>
          <input
            ref={amountRef}
            type="text"
            inputMode="decimal"
            enterKeyHint="done"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="0"
            aria-label="Amount"
            value={formatAmountDisplay(rawAmount)}
            onChange={(e) => setRawAmount(sanitizeAmount(e.target.value))}
            className="ui-display ui-tabular w-full max-w-[14ch] border-0 bg-transparent p-0 text-(--text-primary) outline-none placeholder:text-(--text-tertiary)"
          />
        </label>

        {type !== "transfer" && merchants.length > 0 && (
          <ChipRow>
            {merchants.map((m) => (
              <Chip
                key={m.description}
                selected={
                  description.trim().toLowerCase() ===
                  m.description.toLowerCase()
                }
                onPress={() => pickMerchant(m)}
              >
                {m.description}
              </Chip>
            ))}
          </ChipRow>
        )}

        <FieldLabel>{type === "transfer" ? "Note" : "Merchant"}</FieldLabel>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={
            type === "income"
              ? "Paycheck"
              : type === "transfer"
                ? "Optional"
                : "Whole Foods"
          }
          // Merchant names aren't sentences and aren't in any dictionary:
          // autocorrect turning "Kroger" into "Krieger" is worse than no help
          // at all. Words stay capitalized, since that's how they're written.
          autoCapitalize="words"
          autoCorrect="off"
          spellCheck={false}
          autoComplete="off"
          enterKeyHint="done"
          className="w-full rounded-(--radius-field) bg-(--bg-card-subtle) px-(--space-4) py-(--space-3) text-(length:--text-body) text-(--text-primary) outline-none placeholder:text-(--text-tertiary)"
        />

        <FieldLabel>{type === "transfer" ? "From" : "Account"}</FieldLabel>
        <ChipRow>
          {accounts.map((a) => (
            <Chip
              key={a.id}
              selected={accountId === a.id}
              onPress={() => setAccountId(a.id)}
            >
              {a.name}
            </Chip>
          ))}
        </ChipRow>

        {type === "transfer" ? (
          <>
            <FieldLabel>To</FieldLabel>
            <ChipRow>
              {accounts
                .filter((a) => a.id !== accountId)
                .map((a) => (
                  <Chip
                    key={a.id}
                    selected={toAccountId === a.id}
                    onPress={() => setToAccountId(a.id)}
                  >
                    {a.name}
                  </Chip>
                ))}
            </ChipRow>
          </>
        ) : (
          <>
            <FieldLabel>Category</FieldLabel>
            <ChipRow>
              {orderedCategories.map((c) => (
                <Chip
                  key={c.id}
                  selected={effectiveCategoryId === c.id}
                  onPress={() => {
                    setCategoryId(effectiveCategoryId === c.id ? "" : c.id);
                    setCategoryPinned(true);
                  }}
                >
                  {c.icon ? `${c.icon} ${c.name}` : c.name}
                </Chip>
              ))}
            </ChipRow>
          </>
        )}

        {isDebtAccount && type !== "transfer" && (
          <p className="ui-caption pt-(--space-2)">
            {selectedAccount?.name} is a debt account — this saves as a{" "}
            {actionWord}.
          </p>
        )}

        <FieldLabel>Date</FieldLabel>
        <div className="flex items-center gap-(--space-2)">
          <Chip selected={date === today} onPress={() => setDate(today)}>
            Today
          </Chip>
          <Chip selected={date === yesterday} onPress={() => setDate(yesterday)}>
            Yesterday
          </Chip>
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value || today)}
            aria-label="Date"
            className={`ui-tabular ui-pressable min-w-0 flex-1 rounded-(--radius-pill) px-(--space-3) py-(--space-2) text-(length:--text-caption) font-medium outline-none ${
              date === today || date === yesterday
                ? "bg-(--bg-card-subtle) text-(--text-secondary)"
                : "bg-(--text-primary) text-(--bg-card)"
            }`}
          />
        </div>

        {members.length > 0 && (
          <>
            <FieldLabel>Logged by</FieldLabel>
            <button
              type="button"
              onClick={cycleAuthor}
              disabled={members.length < 2}
              aria-label={`Logged by ${authorName}${members.length > 1 ? " — tap to switch" : ""}`}
              className="ui-pressable flex items-center gap-(--space-3) rounded-(--radius-pill) bg-(--bg-card-subtle) py-(--space-1) pr-(--space-4) pl-(--space-1) disabled:opacity-100"
            >
              <Avatar initial={authorName} />
              <span className="ui-body font-medium text-(--text-primary)">
                {authorName}
              </span>
            </button>
          </>
        )}
      </form>
    </Sheet>
  );
}
