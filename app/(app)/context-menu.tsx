"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// A right-click menu, in the same chrome as the Dropdown menu. Items can
// carry an icon, a hint (e.g. a shortcut), a danger tone, or a nested
// submenu (a long one gets a search box). Opened at the pointer by
// `useContextMenu().open(event, items)`; closes on outside click, Escape,
// scroll, or choosing an item.

export type ContextMenuItem =
  | { type: "divider" }
  | { type: "label"; label: string }
  | {
      type?: "item";
      label: string;
      icon?: React.ReactNode;
      hint?: string;
      tone?: "default" | "danger";
      disabled?: boolean;
      onSelect?: () => void;
      // A nested menu that opens to the side (hover, click, or →).
      submenu?: ContextMenuItem[];
      // Marks the current choice inside a submenu.
      checked?: boolean;
    };

type ActionItem = Extract<ContextMenuItem, { label: string; type?: "item" }>;

const isAction = (i: ContextMenuItem): i is ActionItem => i.type === undefined || i.type === "item";

type OpenState = { x: number; y: number; items: ContextMenuItem[] } | null;

// Matches .animate-modal-panel-out in globals.css.
const EXIT_MS = 120;

export function useContextMenu() {
  const [state, setState] = useState<OpenState>(null);
  const [closing, setClosing] = useState(false);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (exitTimer.current) clearTimeout(exitTimer.current);
    },
    [],
  );

  // Plays the exit animation, then unmounts. Safe to call repeatedly — an
  // outside click and the window blur that follows can both fire.
  function close() {
    if (!state || exitTimer.current) return;
    setClosing(true);
    exitTimer.current = setTimeout(() => {
      exitTimer.current = null;
      setState(null);
      setClosing(false);
    }, EXIT_MS);
  }

  return {
    open(e: React.MouseEvent, items: ContextMenuItem[]) {
      e.preventDefault();
      e.stopPropagation();
      if (exitTimer.current) {
        clearTimeout(exitTimer.current);
        exitTimer.current = null;
      }
      setClosing(false);
      setState({ x: e.clientX, y: e.clientY, items });
    },
    close,
    menu: state ? (
      // Keyed by position so right-clicking somewhere else replays the
      // entrance at the new spot instead of jumping the open menu there.
      <ContextMenu
        key={`${state.x},${state.y}`}
        x={state.x}
        y={state.y}
        items={state.items}
        closing={closing}
        onClose={close}
      />
    ) : null,
  };
}

const SUBMENU_SEARCH_THRESHOLD = 9;

function ContextMenu({
  x,
  y,
  items,
  onClose,
  depth = 0,
  anchor,
  closing = false,
}: {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
  depth?: number;
  // Playing the exit animation; unmounted by the hook once it finishes.
  closing?: boolean;
  // For a submenu: the parent row's rect, so it can flip to the left.
  anchor?: DOMRect;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const [active, setActive] = useState(-1);
  const [openSub, setOpenSub] = useState<{ index: number; rect: DOMRect } | null>(null);
  const [query, setQuery] = useState("");
  const showSearch = depth > 0 && items.filter(isAction).length > SUBMENU_SEARCH_THRESHOLD;
  const visible = query
    ? items.filter((i) => isAction(i) && i.label.toLowerCase().includes(query.toLowerCase()))
    : items;

  // Keep the menu inside the viewport: flip left/up when it would overflow.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    let left = x;
    let top = y;
    if (anchor) {
      left = anchor.right + width + 4 > window.innerWidth ? anchor.left - width - 4 : anchor.right + 4;
      top = Math.min(anchor.top - 4, window.innerHeight - height - 8);
    } else {
      if (left + width > window.innerWidth - 8) left = Math.max(8, x - width);
      if (top + height > window.innerHeight - 8) top = Math.max(8, y - height);
    }
    setPos({ left, top: Math.max(8, top) });
  }, [x, y, anchor]);

  useEffect(() => {
    if (depth > 0) return;
    ref.current?.focus();
    function onDown(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest("[data-context-menu]")) onClose();
    }
    function onScroll(e: Event) {
      if (!(e.target instanceof Node) || !ref.current?.parentElement?.contains(e.target)) onClose();
    }
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onClose);
    window.addEventListener("blur", onClose);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("blur", onClose);
    };
  }, [depth, onClose]);

  function actionIndexes() {
    return visible.map((i, idx) => (isAction(i) && !i.disabled ? idx : -1)).filter((i) => i >= 0);
  }

  function run(item: ActionItem, index: number, target?: HTMLElement | null) {
    if (item.disabled) return;
    if (item.submenu) {
      const rect = (target ?? ref.current?.querySelector<HTMLElement>(`[data-index="${index}"]`))?.getBoundingClientRect();
      if (rect) setOpenSub({ index, rect });
      return;
    }
    onClose();
    item.onSelect?.();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const idxs = actionIndexes();
    const pos = idxs.indexOf(active);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(idxs[(pos + 1) % idxs.length] ?? -1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(idxs[(pos - 1 + idxs.length) % idxs.length] ?? -1);
    } else if (e.key === "Enter" || (e.key === "ArrowRight" && active >= 0)) {
      const item = visible[active];
      if (item && isAction(item) && (e.key === "Enter" || item.submenu)) {
        e.preventDefault();
        run(item, active);
      }
    } else if (e.key === "Escape" || (e.key === "ArrowLeft" && depth > 0)) {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  }

  const sub = openSub ? visible[openSub.index] : null;

  return createPortal(
    <>
      <div
        ref={ref}
        data-context-menu
        role="menu"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        onContextMenu={(e) => e.preventDefault()}
        style={{ left: pos.left, top: pos.top }}
        className={`${
          closing ? "animate-modal-panel-out pointer-events-none" : "animate-modal-panel"
        } fixed z-[210] w-60 overflow-hidden rounded-xl border border-border bg-surface shadow-modal outline-none`}
      >
        {showSearch && (
          <div className="border-b border-border p-1.5">
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(-1);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === "Escape") return;
                e.stopPropagation();
              }}
              placeholder="Search…"
              className="w-full rounded-md bg-bg px-2.5 py-1.5 text-sm text-text outline-none placeholder:text-text-faint"
            />
          </div>
        )}
        <div className="max-h-80 overflow-y-auto p-1">
          {visible.length === 0 && <p className="px-2.5 py-2 text-sm text-text-faint">No matches</p>}
          {visible.map((item, index) => {
            if (item.type === "divider") return <div key={`d${index}`} className="my-1 h-px bg-border" />;
            if (item.type === "label")
              return (
                <p key={`l${index}`} className="text-section-label px-2.5 pt-1.5 pb-1">
                  {item.label}
                </p>
              );
            const isActive = active === index || openSub?.index === index;
            return (
              <div
                key={`${item.label}-${index}`}
                data-index={index}
                role="menuitem"
                aria-disabled={item.disabled}
                aria-haspopup={item.submenu ? "menu" : undefined}
                onMouseEnter={(e) => {
                  setActive(index);
                  if (item.submenu && !item.disabled) setOpenSub({ index, rect: e.currentTarget.getBoundingClientRect() });
                  else setOpenSub(null);
                }}
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => run(item, index, e.currentTarget)}
                className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                  item.disabled ? "cursor-not-allowed opacity-40" : ""
                } ${isActive && !item.disabled ? (item.tone === "danger" ? "bg-negative-bg" : "bg-bg") : ""} ${
                  item.tone === "danger" ? "text-negative" : "text-text-2"
                }`}
              >
                <span className="flex size-4 shrink-0 items-center justify-center" aria-hidden="true">
                  {item.checked ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-accent">
                      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    item.icon
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.hint && <span className="shrink-0 text-xs text-text-faint">{item.hint}</span>}
                {item.submenu && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0 text-text-faint">
                    <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {sub && isAction(sub) && sub.submenu && openSub && (
        <ContextMenu
          key={openSub.index}
          x={0}
          y={0}
          items={sub.submenu}
          anchor={openSub.rect}
          depth={depth + 1}
          closing={closing}
          onClose={depth === 0 ? onClose : () => setOpenSub(null)}
        />
      )}
    </>,
    document.body,
  );
}
