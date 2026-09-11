"use client";

// A single ResizeObserver shared by every caller instead of one per
// component instance. SegmentedProgress renders per-row (20-30+ instances on
// a page is normal) and each used to construct its own ResizeObserver plus
// force a synchronous `getBoundingClientRect()` read during its own
// useLayoutEffect — dozens of observer objects and dozens of eager layout
// reads on every mount. One shared observer means one native object no
// matter how many elements register, and reading width off the
// ResizeObserverEntry the browser already computed (instead of a manual
// getBoundingClientRect call) means no extra forced layout at all — the
// browser delivers entries for newly-observed elements before the next
// paint, so there's no visible flash versus the old synchronous read.
let observer: ResizeObserver | null = null;
const callbacks = new WeakMap<Element, (width: number) => void>();

function getObserver() {
  if (!observer) {
    observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        callbacks.get(entry.target)?.(entry.contentRect.width);
      }
    });
  }
  return observer;
}

// Registers `el` for width updates via `onWidth`, called once shortly after
// registering (the browser's own initial ResizeObserver notification) and
// again whenever the element resizes. Returns a cleanup function.
export function observeWidth(el: Element, onWidth: (width: number) => void): () => void {
  callbacks.set(el, onWidth);
  getObserver().observe(el);
  return () => {
    callbacks.delete(el);
    observer?.unobserve(el);
  };
}
