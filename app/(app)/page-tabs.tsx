"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

// A simple `?view=` tab strip shared by pages that consolidate several
// former standalone routes (Transactions, Reports) into one page with
// sub-views, instead of duplicating this pill-tab pattern per page.
export function PageTabs({ tabs }: { tabs: { value: string; label: string }[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get("view") ?? tabs[0]?.value;

  return (
    <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-bg p-1">
      {tabs.map((t) => {
        const isDefault = t.value === tabs[0].value;
        const href = isDefault ? pathname : `${pathname}?view=${t.value}`;
        const active = current === t.value;
        return (
          <Link
            key={t.value}
            href={href}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
              active ? "bg-surface text-accent shadow-card" : "text-text-muted hover:text-text"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
