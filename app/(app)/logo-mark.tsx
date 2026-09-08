// Brand mark: three ascending bars instead of a plain letterform — a plain
// geometric growth motif (echoes the bar charts already used throughout the
// dashboard) rather than a soft circular ring, so it reads as more modern
// and angular at small sizes.
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-lg bg-accent"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 40 40" width={size * 0.6} height={size * 0.6} fill="none">
        <rect x="6" y="20" width="7" height="14" rx="1.5" fill="white" />
        <rect x="16.5" y="12" width="7" height="22" rx="1.5" fill="white" fillOpacity="0.75" />
        <rect x="27" y="6" width="7" height="28" rx="1.5" fill="white" fillOpacity="0.5" />
      </svg>
    </span>
  );
}
