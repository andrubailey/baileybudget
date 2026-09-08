import Link from "next/link";
import { formatMoney } from "@/lib/format";
import { getCategoryIcon } from "@/lib/category-icons";
import type { Category } from "@/lib/types";
import type { UpcomingBill } from "@/lib/queries";

function ordinal(day: number): string {
  if (day % 10 === 1 && day !== 11) return `${day}st`;
  if (day % 10 === 2 && day !== 12) return `${day}nd`;
  if (day % 10 === 3 && day !== 13) return `${day}rd`;
  return `${day}th`;
}

export function UpcomingBillsCard({
  bills,
  categories,
}: {
  bills: UpcomingBill[];
  categories: Category[];
}) {
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const shown = bills.slice(0, 5);

  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-card">
      <div className="mb-3 flex items-baseline justify-between">
        <p className="text-heading text-text">Upcoming bills</p>
        <Link href="/transactions?view=recurring" className="text-xs font-medium text-accent underline underline-offset-2">
          View all
        </Link>
      </div>

      {shown.length === 0 ? (
        <p className="py-4 text-sm text-text-muted">Nothing left to pay this period.</p>
      ) : (
        <div className="divide-y divide-border">
          {shown.map((bill) => {
            const category = bill.category_id ? categoryById.get(bill.category_id) : undefined;
            return (
              <div key={bill.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-bg text-sm">
                  {category ? getCategoryIcon(category.name, category.icon) : "🧾"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text">{bill.description}</p>
                  <p className={`text-xs ${bill.due ? "text-[#f04438]" : "text-text-faint"}`}>
                    {bill.due ? "Overdue" : `Due ${ordinal(bill.day_of_month)}`}
                  </p>
                </div>
                <span className="tabular shrink-0 text-sm font-medium text-text">
                  -{formatMoney(bill.amount)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
