import Link from "next/link";

type AttentionItem = { key: string; message: string; href?: string };

// A single glanceable "here's what needs a look" surface, instead of making
// someone notice a red bar in the budget list and a low-balance account
// separately. Renders nothing (see page.tsx) when there's nothing to flag.
export function NeedsAttention({ items }: { items: AttentionItem[] }) {
  return (
    <div className="rounded-xl border border-[#fedf89] bg-[#fffaeb] p-4">
      <p className="text-sm font-semibold text-[#93370d]">Needs attention</p>
      <ul className="mt-2 space-y-1.5">
        {items.map((item) => (
          <li key={item.key} className="text-sm text-[#93370d]">
            {item.href ? (
              <Link href={item.href} className="underline underline-offset-2 hover:no-underline">
                {item.message}
              </Link>
            ) : (
              item.message
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
