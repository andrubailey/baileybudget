"use client";

import { useEffect, useEffectEvent, useId, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useKeyboardInset } from "./use-keyboard-inset";

const noopSubscribe = () => () => {};

function isEditable(el: Element | null) {
  return (
    el instanceof HTMLElement &&
    (el.isContentEditable || (el instanceof HTMLInputElement && el.type !== "button") || el instanceof HTMLTextAreaElement)
  );
}

// Bottom sheet: drag handle, title row with close, scrollable body, and an
// optional footer pinned under the body for the submit action. Rides on
// top of the on-screen keyboard (see useKeyboardInset), and keeps the
// focused field scrolled into view, so the field and the footer's submit
// button stay visible together. Stays mounted through its exit animation.
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  initialFocus,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  // Field to focus when the sheet opens (e.g. the amount). Without it the
  // panel itself takes focus — unless a field already has it.
  initialFocus?: React.RefObject<HTMLElement | null>;
}) {
  const isClient = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [rendered, setRendered] = useState(open);
  if (open && !rendered) setRendered(true);

  const keyboardInset = useKeyboardInset();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<number | null>(null);
  const [drag, setDrag] = useState(0);

  // Exit: unmount once the slide-out finishes (with a timer fallback in
  // case no transition runs, e.g. reduced motion).
  useEffect(() => {
    if (open || !rendered) return;
    const timer = setTimeout(() => setRendered(false), 400);
    return () => clearTimeout(timer);
  }, [open, rendered]);

  // Read at call time, so a parent passing a fresh onClose each render
  // doesn't re-run the effect below (which would pull focus off whatever
  // field is being typed in, closing the keyboard mid-entry).
  const requestClose = useEffectEvent(() => onClose());

  // Focus on open and hand focus back on close; lock page scroll. A field
  // that already has focus keeps it — including one primed by
  // primeKeyboard(), so the iOS keyboard raised during the tap survives
  // until the real field takes over.
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const target = initialFocus?.current;
    if (target) {
      target.focus({ preventScroll: true });
    } else if (!isEditable(document.activeElement) && !panelRef.current?.contains(document.activeElement)) {
      panelRef.current?.focus({ preventScroll: true });
    }
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      root.style.overflow = previousOverflow;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open, initialFocus]);

  // When the keyboard opens, resizes (numeric keypad vs. full keyboard),
  // or focus moves between fields, keep the focused field in view.
  useEffect(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && bodyRef.current?.contains(active)) {
      active.scrollIntoView({ block: "nearest" });
    }
  }, [keyboardInset]);

  if (!rendered || !isClient) return null;

  const state = open ? "open" : "closed";

  function onPointerDown(e: React.PointerEvent) {
    dragStart.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (dragStart.current === null) return;
    setDrag(Math.max(0, e.clientY - dragStart.current));
  }
  function onPointerUp() {
    if (dragStart.current === null) return;
    dragStart.current = null;
    const height = panelRef.current?.offsetHeight ?? 1;
    if (drag > height * 0.25) onClose();
    setDrag(0);
  }

  return createPortal(
    <>
      <div className="ui-sheet-backdrop" data-state={state} onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="ui-sheet"
        data-state={state}
        data-dragging={drag > 0 ? "true" : undefined}
        data-keyboard={keyboardInset > 0 ? "true" : undefined}
        style={
          {
            "--keyboard-inset": `${keyboardInset}px`,
            "--sheet-drag": `${drag}px`,
          } as React.CSSProperties
        }
        onTransitionEnd={(e) => {
          if (e.target === e.currentTarget && !open) setRendered(false);
        }}
        onFocus={(e) => {
          if (e.target instanceof HTMLElement && bodyRef.current?.contains(e.target)) {
            e.target.scrollIntoView({ block: "nearest" });
          }
        }}
      >
        <div onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          <div className="ui-sheet-handle" aria-hidden="true" />
          <div className="flex items-center justify-between gap-(--space-3) px-(--space-4) pb-(--space-3)">
            <h2 id={titleId} className="ui-body min-w-0 truncate font-semibold">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label="Close"
              className="ui-pressable -mr-(--space-2) flex size-11 shrink-0 items-center justify-center rounded-(--radius-pill) text-(--text-secondary)"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
        <div ref={bodyRef} className="ui-sheet-body">
          {children}
        </div>
        {footer && <div className="ui-sheet-footer">{footer}</div>}
      </div>
    </>,
    document.body,
  );
}
