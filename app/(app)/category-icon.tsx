import { getCategoryIconKey, type CategoryIconKey } from "@/lib/category-icons";
import { CooliconPaths } from "@/app/(app)/coolicon";

// Category icons. Where the coolicons set has a fitting icon it's used
// directly (see coolicon.tsx); the rest are custom drawings on the same
// 24px grid at the same 2px stroke, so the two sets read as one family.
// Everything is colored by `currentColor`, so the caller decides the color.
const PATHS: Record<CategoryIconKey, React.ReactNode> = {
  groceries: <CooliconPaths name="Shopping_Cart_01" />,
  dining: <CooliconPaths name="Cupcake" />,
  coffee: <CooliconPaths name="Coffee" />,
  dates: <CooliconPaths name="Heart_02" />,
  housing: <CooliconPaths name="House_01" />,
  utilities: <CooliconPaths name="Bulb" />,
  bills: <CooliconPaths name="File_Document" />,
  internet: <CooliconPaths name="Wifi_High" />,
  phone: <CooliconPaths name="Mobile" />,
  streaming: <CooliconPaths name="Monitor_Play" />,
  car: (
    <>
      <path d="M5 11l2-5h10l2 5" />
      <path d="M3 11h18v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5Z" />
      <path d="M6 17v2M18 17v2M7 14h.01M17 14h.01" />
    </>
  ),
  transit: (
    <>
      <rect x="5" y="3" width="14" height="15" rx="2" />
      <path d="M5 11h14" />
      <path d="M8 18v2M16 18v2M8.5 14.5h.01M15.5 14.5h.01" />
    </>
  ),
  travel: (
    <path d="M21 15.5v-2l-8-5V4a1.5 1.5 0 0 0-3 0v4.5l-8 5v2l8-2.5V18l-2 1.5V21l3.5-1 3.5 1v-1.5L13 18v-4.5l8 2Z" />
  ),
  insurance: <CooliconPaths name="Shield_Check" />,
  health: (
    <>
      <path d="M20.5 8.5c0 5-8.5 11-8.5 11s-8.5-6-8.5-11A4.5 4.5 0 0 1 12 6a4.5 4.5 0 0 1 8.5 2.5Z" />
      <path d="M7 12h2.5L11 9.5l2 5 1.5-2.5H17" />
    </>
  ),
  fitness: <path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11" />,
  beauty: (
    <>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="6" cy="18" r="2.5" />
      <path d="M8 7.5 20 17M8 16.5 20 7" />
    </>
  ),
  shopping: <CooliconPaths name="Shopping_Bag_01" />,
  entertainment: (
    <>
      <path d="M3 8a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v2a2 2 0 0 0 0 4v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-2a2 2 0 0 0 0-4V8Z" />
      <path d="M14.5 7v2M14.5 11v2M14.5 15v2" />
    </>
  ),
  subscriptions: (
    <>
      <path d="M17 3l3 3-3 3" />
      <path d="M4 12V9a3 3 0 0 1 3-3h13" />
      <path d="M7 21l-3-3 3-3" />
      <path d="M20 12v3a3 3 0 0 1-3 3H4" />
    </>
  ),
  education: (
    <>
      <path d="M2.5 9 12 4.5 21.5 9 12 13.5 2.5 9Z" />
      <path d="M6.5 11v4.5c0 1.5 2.5 3 5.5 3s5.5-1.5 5.5-3V11" />
      <path d="M21.5 9v5" />
    </>
  ),
  kids: (
    <>
      <path d="M12 3a5.5 5.5 0 0 0-5.5 5.5c0 3.5 3 6.5 5.5 6.5s5.5-3 5.5-6.5A5.5 5.5 0 0 0 12 3Z" />
      <path d="M12 15c-1.5 2 1.5 3.5 0 6" />
    </>
  ),
  pets: (
    <>
      <circle cx="6.5" cy="10" r="1.6" />
      <circle cx="10" cy="6.5" r="1.6" />
      <circle cx="14" cy="6.5" r="1.6" />
      <circle cx="17.5" cy="10" r="1.6" />
      <path d="M12 12c-2.5 0-5 2.8-5 5.2 0 1.5 1.2 2.3 2.6 2.3 1 0 1.6-.5 2.4-.5s1.4.5 2.4.5c1.4 0 2.6-.8 2.6-2.3 0-2.4-2.5-5.2-5-5.2Z" />
    </>
  ),
  gift: (
    <>
      <rect x="3.5" y="8" width="17" height="4" rx="1" />
      <path d="M5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8M12 8v13" />
      <path d="M12 8C10.5 4.5 7 4 7 6.3 7 8 12 8 12 8Zm0 0c1.5-3.5 5-4 5-1.7C17 8 12 8 12 8Z" />
    </>
  ),
  giving: <path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.2 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z" />,
  repairs: (
    <path d="M14.7 6.3a4 4 0 0 1 5-3.3l-2.6 2.6.5 2.3 2.3.5L22.5 5.8a4 4 0 0 1-5.4 5l-7.4 7.4a2.1 2.1 0 0 1-3-3l7.4-7.4a4 4 0 0 1 .6-1.5Z" />
  ),
  debt: <CooliconPaths name="Credit_Card_01" />,
  bank: (
    <>
      <path d="M3 9.5 12 4l9 5.5" />
      <path d="M5.5 10.5v7M10 10.5v7M14 10.5v7M18.5 10.5v7" />
      <path d="M3 20.5h18" />
    </>
  ),
  savings: (
    <>
      <path d="M19 11.5c0-3.6-3.1-6.5-7-6.5-1.1 0-2.2.2-3.1.7L6.5 4v3.2A6.3 6.3 0 0 0 5.2 10H3.5v4h1.8a6.8 6.8 0 0 0 2.2 2.8V20h3v-2h3v2h3v-3.4c1.5-1.2 2.5-3 2.5-5.1Z" />
      <path d="M10 7.5h3M15.5 10.5h.01" />
    </>
  ),
  transfer: (
    <>
      <path d="M7 7h13M16 3l4 4-4 4" />
      <path d="M17 17H4M8 13l-4 4 4 4" />
    </>
  ),
  tax: (
    <>
      <path d="M6 3.5h12v17l-2-1.2-2 1.2-2-1.2-2 1.2-2-1.2-2 1.2v-17Z" />
      <path d="M9.5 13.5l5-5M9.5 9h.01M14.5 13h.01" />
    </>
  ),
  business: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 12.5h18" />
    </>
  ),
  income: <CooliconPaths name="Trending_Up" />,
  refund: (
    <>
      <path d="M4 12a8 8 0 1 0 2.3-5.6" />
      <path d="M4 4v3.5h3.5" />
      <path d="M12 8v8M14 9.5h-2.8a1.6 1.6 0 0 0 0 3.2h1.6a1.6 1.6 0 0 1 0 3.2H10" />
    </>
  ),
  rollover: (
    <>
      <path d="M20 12a8 8 0 1 1-2.3-5.6" />
      <path d="M20 4v3.5h-3.5" />
    </>
  ),
  personal: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c.8-3.5 3.6-5.5 7-5.5s6.2 2 7 5.5" />
    </>
  ),
  other: (
    <>
      <path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9-9-9Z" />
      <circle cx="7.5" cy="7.5" r="1.2" />
    </>
  ),
};

export function CategoryIconGlyph({
  iconKey,
  size = 16,
  className = "",
}: {
  iconKey: CategoryIconKey;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      <g stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        {PATHS[iconKey]}
      </g>
    </svg>
  );
}

// Resolves a category's icon (hand-picked key, legacy emoji, or a guess from
// its name) and draws it.
export function CategoryIcon({
  name,
  icon,
  size = 16,
  className = "",
}: {
  name: string;
  icon?: string | null;
  size?: number;
  className?: string;
}) {
  return <CategoryIconGlyph iconKey={getCategoryIconKey(name, icon)} size={size} className={className} />;
}
