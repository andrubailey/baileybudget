// Brand mark: a progress ring instead of a plain letterform — echoes the
// donut chart already used for "Expenses by category" on the dashboard, so
// the logo reads as "this app tracks where your money goes" rather than
// being an arbitrary monogram.
const RADIUS = 13;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const ARC_LENGTH = CIRCUMFERENCE * 0.28;

export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-lg bg-accent"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 40 40" width={size * 0.72} height={size * 0.72} fill="none">
        <circle
          cx="20"
          cy="20"
          r={RADIUS}
          stroke="white"
          strokeOpacity="0.35"
          strokeWidth="6"
        />
        <circle
          cx="20"
          cy="20"
          r={RADIUS}
          stroke="white"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${ARC_LENGTH} ${CIRCUMFERENCE - ARC_LENGTH}`}
          transform="rotate(-90 20 20)"
        />
      </svg>
    </span>
  );
}
