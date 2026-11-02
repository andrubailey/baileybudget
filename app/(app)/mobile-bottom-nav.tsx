"use client";

import { useState } from "react";
import type { Account, Category } from "@/lib/types";
import { BottomNav } from "@/components/ui";
import { MobileAddSheet } from "./add/mobile-add-sheet";
import { useNotifications } from "./notifications";

// The app's instance of <BottomNav>: "+" opens the add-transaction sheet, and
// the bell opens the notifications sidebar.
export function MobileBottomNav({
  periodId,
  accounts,
  categories,
}: {
  // For the add sheet — null only if this month's period couldn't be set up.
  periodId: string | null;
  accounts: Account[];
  categories: Category[];
}) {
  const [adding, setAdding] = useState(false);
  const { unseenCount, open } = useNotifications();
  return (
    <>
      {/* The sheet opens on its amount field, so bring the numeric keypad
          up during the tap itself — iOS won't raise it any later. */}
      <BottomNav
        onAdd={() => setAdding(true)}
        addDisabled={!periodId}
        addKeyboard="decimal"
        notifications={{ count: unseenCount, onPress: open }}
      />
      {adding && periodId && (
        <MobileAddSheet
          periodId={periodId}
          accounts={accounts}
          categories={categories}
          onClose={() => setAdding(false)}
        />
      )}
    </>
  );
}
