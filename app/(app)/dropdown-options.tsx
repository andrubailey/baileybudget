import type { DropdownOption } from "@/app/(app)/dropdown";
import { BankLogo } from "@/app/(app)/accounts/bank-logo";
import { CategoryChip } from "@/app/(app)/category-chip";
import { CategoryIconGlyph } from "@/app/(app)/category-icon";
import { Coolicon } from "@/app/(app)/coolicon";
import type { CategoryIconKey } from "@/lib/category-icons";
import {
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_TYPES,
  BANK_OPTIONS,
  OBJECTIVE_STATUSES,
  type Account,
  type AccountType,
  type Category,
} from "@/lib/types";

// Option lists for the shared Dropdown, with the right leading visual for
// each kind of thing — so every account picker shows the same logo, every
// category picker the same colored icon, wherever it appears.

const KNOWN_BANKS = new Set<string>(BANK_OPTIONS);

const ACCOUNT_TYPE_GLYPH: Record<AccountType, CategoryIconKey> = {
  checking: "bank",
  savings: "savings",
  credit_card: "debt",
  loan: "bills",
  cash: "income",
  investment: "income",
  other: "other",
};

function GlyphTile({ iconKey }: { iconKey: CategoryIconKey }) {
  return (
    <span className="flex size-5 items-center justify-center rounded-md bg-bg text-text-muted">
      <CategoryIconGlyph iconKey={iconKey} size={13} />
    </span>
  );
}

function withEmpty(options: DropdownOption[], emptyLabel?: string): DropdownOption[] {
  return emptyLabel === undefined ? options : [{ value: "", label: emptyLabel }, ...options];
}

type AccountLike = Pick<Account, "id" | "name" | "bank" | "account_type" | "is_debt"> & {
  logo_url?: string | null;
};

// An account's own uploaded photo, else its bank's logo, else a glyph for
// its type — the same priority the Accounts page and Overview rail use.
export function AccountOptionIcon({ account }: { account: AccountLike }) {
  if (account.logo_url) {
    return (
      <span className="inline-flex size-5 overflow-hidden rounded-md border border-border bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded storage URL */}
        <img src={account.logo_url} alt="" className="size-full object-cover" />
      </span>
    );
  }
  if (account.bank && KNOWN_BANKS.has(account.bank)) return <BankLogo bank={account.bank} size="sm" />;
  return <GlyphTile iconKey={account.account_type ? ACCOUNT_TYPE_GLYPH[account.account_type] : account.is_debt ? "debt" : "bank"} />;
}

export function accountChoices(accounts: AccountLike[], emptyLabel?: string): DropdownOption[] {
  return withEmpty(
    accounts.map((a) => ({
      value: a.id,
      label: a.name,
      icon: <AccountOptionIcon account={a} />,
      description: a.account_type ? ACCOUNT_TYPE_LABELS[a.account_type] : a.is_debt ? "Debt" : undefined,
    })),
    emptyLabel,
  );
}

export function bankChoices(banks: readonly string[], emptyLabel?: string): DropdownOption[] {
  return withEmpty(
    banks.map((b) => ({
      value: b,
      label: b,
      icon: KNOWN_BANKS.has(b) ? <BankLogo bank={b} size="sm" /> : <GlyphTile iconKey="bank" />,
    })),
    emptyLabel,
  );
}

export function accountTypeChoices(emptyLabel?: string): DropdownOption[] {
  return withEmpty(
    ACCOUNT_TYPES.map((t) => ({
      value: t,
      label: ACCOUNT_TYPE_LABELS[t],
      icon: <GlyphTile iconKey={ACCOUNT_TYPE_GLYPH[t]} />,
    })),
    emptyLabel,
  );
}

export function categoryChoices(
  categories: Pick<Category, "id" | "name" | "icon">[],
  emptyLabel?: string,
): DropdownOption[] {
  return withEmpty(
    categories.map((c) => ({
      value: c.id,
      label: c.name,
      icon: <CategoryChip id={c.id} name={c.name} icon={c.icon} size="xs" showName={false} />,
    })),
    emptyLabel,
  );
}

const STATUS_DOT: Record<string, string> = {
  "Not Started": "bg-neutral",
  "In Progress": "bg-accent",
  "On Hold": "bg-caution",
  Achieved: "bg-positive",
};

export function goalStatusChoices(): DropdownOption[] {
  return OBJECTIVE_STATUSES.map((s) => ({
    value: s,
    label: s,
    icon: <span className={`size-2 rounded-full ${STATUS_DOT[s] ?? "bg-neutral"}`} />,
  }));
}

export function kindChoices(): DropdownOption[] {
  return [
    { value: "expense", label: "Expense", icon: <Coolicon name="Trending_Down" size={16} className="text-negative" /> },
    { value: "income", label: "Income", icon: <Coolicon name="Trending_Up" size={16} className="text-positive" /> },
  ];
}
