import { getAvatarColors } from "@/lib/avatar-colors";
import type { CalendarAssignee } from "@/lib/types";

// A colored-initial badge, same convention as the sidebar's profile avatar
// (getAvatarColors hashes a stable pastel per seed) — reused here with a
// fixed seed per assignee value instead of an email, since "Kids"/"Family"
// aren't accounts that have one.
export function AssigneeBadge({
  assignee,
  size = "sm",
}: {
  assignee: CalendarAssignee;
  size?: "sm" | "xs";
}) {
  const colors = getAvatarColors(assignee);
  const sizeClass = size === "xs" ? "size-3.5 text-[8px]" : "size-4 text-[9px]";
  return (
    <span
      aria-hidden="true"
      className={`inline-flex ${sizeClass} shrink-0 items-center justify-center rounded-full font-semibold`}
      style={{ backgroundColor: colors.bg, color: colors.text }}
    >
      {assignee[0].toUpperCase()}
    </span>
  );
}
