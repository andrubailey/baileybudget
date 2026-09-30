"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { MOBILE_ROUTES, isActiveTab, type MobileRouteKey } from "./routes";
import { useKeyboardInset } from "./use-keyboard-inset";
import { primeKeyboard } from "./prime-keyboard";

const ICONS: Record<MobileRouteKey, React.ReactNode> = {
  home: <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1v-8.5Z" />,
  money: (
    <>
      <path d="M12 3v9h9" />
      <path d="M20.5 15.5A9 9 0 1 1 8.5 3.7" />
    </>
  ),
  accounts: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18M7 15h3" />
    </>
  ),
  activity: <path d="M3 12h4l3-7 4 14 3-7h4" />,
};

// Fixed mobile nav: the four destinations as icons in one pill (active
// one sits in a gray pill), and a separate dark pill on the right for the
// primary "+" action. That dark pill has a second slot, `secondaryAction`,
// reserved for a future voice-entry button — it renders nothing until one
// is passed. Hidden on desktop and while the on-screen keyboard is open.
export function BottomNav({
  onAdd,
  addDisabled = false,
  addLabel = "Add transaction",
  addKeyboard,
  secondaryAction,
}: {
  onAdd: () => void;
  addDisabled?: boolean;
  addLabel?: string;
  // Raise this keyboard during the "+" tap (see primeKeyboard), for an add
  // flow that opens straight into a field.
  addKeyboard?: "decimal" | "numeric" | "text";
  // Future voice entry. Pass a <button className="ui-bottom-nav-action ui-pressable"> to fill it.
  secondaryAction?: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const keyboardOpen = useKeyboardInset() > 0;
  const activeIndex = MOBILE_ROUTES.findIndex((route) => isActiveTab(route.href, pathname));

  // iOS Safari only applies :active (the press feedback) when the page has
  // a touch listener; an empty passive one is enough.
  useEffect(() => {
    const noop = () => {};
    document.addEventListener("touchstart", noop, { passive: true });
    return () => document.removeEventListener("touchstart", noop);
  }, []);

  return (
    <nav aria-label="Main" className="ui-bottom-nav" data-hidden={keyboardOpen ? "true" : undefined}>
      <div className="ui-bottom-nav-tabs">
        {MOBILE_ROUTES.map((route, i) => {
          const active = i === activeIndex;
          return (
            <Link
              key={route.key}
              href={route.href}
              aria-label={route.label}
              aria-current={active ? "page" : undefined}
              // Start fetching on touch-down rather than on release.
              onPointerDown={() => router.prefetch(route.href)}
              transitionTypes={
                activeIndex === -1 || active ? undefined : [i > activeIndex ? "nav-forward" : "nav-back"]
              }
              className="ui-bottom-nav-tab ui-pressable"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {ICONS[route.key]}
              </svg>
            </Link>
          );
        })}
      </div>
      <div className="ui-bottom-nav-actions">
        {secondaryAction}
        <button
          type="button"
          onClick={() => {
            if (addKeyboard) primeKeyboard(addKeyboard);
            onAdd();
          }}
          disabled={addDisabled}
          aria-label={addLabel}
          className="ui-bottom-nav-action ui-pressable"
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </nav>
  );
}
