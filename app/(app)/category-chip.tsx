import { getCategoryColor } from "@/lib/category-colors";
import { CategoryIcon } from "@/app/(app)/category-icon";

// A category, rendered the same way everywhere it appears: its icon in a
// tinted circle of the category's own (stable, id-hashed) color, then the
// name. The budget table, the transactions table, the mobile cards, the
// reports' top-category tile and the donut legend all used to draw this
// slightly differently — same color rule, different chrome — so a category
// didn't quite look like itself from one screen to the next.
export function CategoryChip({
  id,
  name,
  icon,
  size = "sm",
  showName = true,
  className = "",
}: {
  id: string;
  name: string;
  icon?: string | null;
  // "xs" is for dense table cells, "sm" for list rows, "md" for a
  // headline (a tile, a card header).
  size?: "xs" | "sm" | "md";
  showName?: boolean;
  className?: string;
}) {
  const color = getCategoryColor(id);
  const circle = size === "md" ? "size-9" : size === "sm" ? "size-7" : "size-5";
  const iconSize = size === "md" ? 18 : size === "sm" ? 14 : 11;
  const text = size === "md" ? "text-sm font-semibold" : "text-sm font-medium";
  return (
    <span className={`inline-flex min-w-0 items-center gap-2 ${className}`}>
      <span
        className={`flex shrink-0 items-center justify-center rounded-full ${circle}`}
        style={{ backgroundColor: `${color}26`, color }}
        aria-hidden="true"
      >
        <CategoryIcon name={name} icon={icon} size={iconSize} />
      </span>
      {showName && <span className={`truncate text-text ${text}`}>{name}</span>}
    </span>
  );
}

// Just the dot — for legends and places where the icon is too loud.
export function CategoryDot({ id, className = "" }: { id: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block size-2 shrink-0 rounded-full ${className}`}
      style={{ backgroundColor: getCategoryColor(id) }}
    />
  );
}
