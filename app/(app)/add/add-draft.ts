"use client";

// Losing a half-typed transaction is the worst failure this screen can have:
// the phone rings, the app goes to the background, iOS reclaims the tab, and
// the amount you were mid-way through typing is gone. So every keystroke is
// mirrored to localStorage and restored on mount. Cleared the moment a save
// succeeds, so a fresh open is never haunted by a finished entry.
const DRAFT_KEY = "budgetapp-add-draft-v1";

// Long enough to survive a phone call, a night's sleep, or a forced app
// restart; short enough that a draft abandoned days ago doesn't resurface as
// a mystery half-entry.
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

export type AddDraft = {
  type: "expense" | "transfer" | "income";
  rawAmount: string;
  description: string;
  accountId: string;
  toAccountId: string;
  categoryId: string;
  date: string;
  loggedBy: string;
  savedAt: number;
};

export function loadDraft(): Partial<AddDraft> | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AddDraft>;
    if (!parsed.savedAt || Date.now() - parsed.savedAt > DRAFT_TTL_MS) {
      window.localStorage.removeItem(DRAFT_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

// Nothing typed yet isn't a draft — an empty amount with no description would
// restore as "you were in the middle of something" when you weren't.
export function saveDraft(draft: Omit<AddDraft, "savedAt">) {
  try {
    if (!draft.rawAmount && !draft.description) {
      window.localStorage.removeItem(DRAFT_KEY);
      return;
    }
    window.localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ ...draft, savedAt: Date.now() }),
    );
  } catch {
    // Private mode, or storage full. The entry still works; it just won't
    // survive a background — not worth failing the screen over.
  }
}

export function clearDraft() {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // See saveDraft.
  }
}
