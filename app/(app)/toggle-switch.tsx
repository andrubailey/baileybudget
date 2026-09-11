"use client";

// The one on/off switch look used everywhere in the app (account settings,
// budget editor, recurring rules, "repeats monthly"). The visible track is
// intentionally small (h-5 w-9, matching every other switch this app has
// ever shown), but the button itself carries extra invisible padding so the
// actual tap target is close to the ~40px comfortable minimum — the negative
// margin cancels that padding back out so the track still lines up exactly
// where a plain h-5 w-9 button would have sat in its row.
export function ToggleSwitch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative -m-2.5 flex shrink-0 items-center justify-center p-2.5 disabled:opacity-60"
    >
      <span
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
          checked ? "bg-accent" : "bg-neutral-track"
        }`}
      >
        <span
          className={`inline-block size-4 rounded-full bg-white shadow-card transition-transform ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}
