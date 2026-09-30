import Link from "next/link";

// Renders a Link when given href, a button when given onPress, otherwise a
// plain div — so rows and headers only get press feedback when they
// actually do something.
export function Pressable({
  href,
  onPress,
  className = "",
  children,
  ariaLabel,
}: {
  href?: string;
  onPress?: () => void;
  className?: string;
  children: React.ReactNode;
  ariaLabel?: string;
}) {
  if (href) {
    return (
      <Link href={href} aria-label={ariaLabel} className={`ui-pressable ${className}`}>
        {children}
      </Link>
    );
  }
  if (onPress) {
    return (
      <button type="button" onClick={onPress} aria-label={ariaLabel} className={`ui-pressable text-left ${className}`}>
        {children}
      </button>
    );
  }
  return <div className={className}>{children}</div>;
}
