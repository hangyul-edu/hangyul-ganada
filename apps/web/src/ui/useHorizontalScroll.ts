import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';

/**
 * How far the pointer must travel before a press becomes a drag.
 *
 * Below this the gesture is a click and the child gets it; above it the row
 * takes over and the click is suppressed. 6 px is comfortably more than the
 * jitter of a mouse being pressed and less than any deliberate swipe — the
 * threshold is the whole reason "tap Level 4" and "drag the row" are not the
 * same gesture.
 */
export const DRAG_THRESHOLD_PX = 6;

export interface HorizontalScrollOptions {
  /**
   * Drag-to-scroll with a mouse. Turn it off for a row whose children want the
   * pointer themselves — the writing canvases in a word lesson are a drawing
   * surface, and stealing a drag from them would erase a stroke.
   */
  draggable?: boolean;
  /** Class applied to the element while a drag is in progress. */
  draggingClassName?: string;
}

export interface HorizontalScroll {
  ref: RefObject<HTMLDivElement | null>;
  /** Spread onto the scrolling element. */
  props: {
    onScroll: () => void;
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void;
    onClickCapture: (event: ReactMouseEvent<HTMLDivElement>) => void;
  };
  /** Whether there is content past each edge, for a fade or an indicator. */
  overflow: { start: boolean; end: boolean };
}

/**
 * Makes a horizontally overflowing row reachable on every input a person has.
 *
 * Several rows in the app are wider than the screen — the vocabulary level
 * filters, the syllable boxes in a three-syllable word. Before this, each was a
 * bare `overflow-x: auto`, which is enough on a phone and *not* enough anywhere
 * else: a mouse has no way to push a horizontal scroller, so on a desktop
 * browser the row simply looked truncated, with content visible and
 * unreachable.
 *
 * What this adds, in the order a user is likely to try:
 *
 * * **Touch** — untouched. The native behaviour was already right, and pointer
 *   capture is only ever taken for a mouse.
 * * **Trackpad** — also native. A two-finger horizontal swipe arrives with
 *   `deltaX` and the browser applies it; this stays out of the way.
 * * **Mouse wheel** — a plain wheel has only `deltaY`, which a horizontal
 *   scroller ignores. It is mapped onto the row, but *only while the row still
 *   has somewhere to go*: at either end the event is left alone so the page
 *   keeps scrolling, which is what someone wheeling past a filter row meant.
 * * **Mouse drag** — press and pull, past `DRAG_THRESHOLD_PX`. Under the
 *   threshold the press is an ordinary click on whatever chip is beneath it.
 * * **Keyboard** — nothing needed and nothing added. Every child is a real
 *   button, and tabbing to one scrolls it into view; no content here is
 *   reachable by pointer alone.
 *
 * The hook, rather than only a component, because the two rows that need it
 * have very different layout: one is a strip of pills, the other is a snapping
 * carousel of writing canvases with its own direction and spacing. Sharing the
 * *behaviour* and leaving each its own CSS is the seam that actually fits.
 * `ScrollRow` is the component for the common case.
 */
export function useHorizontalScroll({
  draggable = true,
  draggingClassName,
}: HorizontalScrollOptions = {}): HorizontalScroll {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    pointerId: number;
    startX: number;
    startScroll: number;
    moved: boolean;
  }>(undefined);
  const [overflow, setOverflow] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setOverflow((prev) => {
      const start = el.scrollLeft > 1;
      const end = max > 1 && el.scrollLeft < max - 1;
      return prev.start === start && prev.end === end ? prev : { start, end };
    });
  }, []);

  useEffect(() => {
    measure();
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    // The row's contents change with the interface language and with the data,
    // and an edge fade that lies about there being more is worse than none.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);
    return () => observer.disconnect();
  });

  /**
   * The wheel listener is attached by hand, and that is not an oversight.
   *
   * React registers `onWheel` on the root as a **passive** listener, so
   * `preventDefault()` inside a JSX handler does nothing but log a warning —
   * the page scrolls vertically at the same time the row scrolls sideways, and
   * a learner wheeling over the level filters watches the whole screen slide
   * away under their cursor. A non-passive listener on the element itself is
   * the only way to claim the event.
   */
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onWheel = (event: WheelEvent) => {
      // A trackpad's sideways swipe already works; only a vertical-only wheel
      // needs redirecting.
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 1) return;
      if (
        (event.deltaY < 0 && el.scrollLeft <= 0) ||
        (event.deltaY > 0 && el.scrollLeft >= max - 1)
      ) {
        return; // At the end: the page should have this one.
      }
      event.preventDefault();
      el.scrollLeft = Math.max(0, Math.min(max, el.scrollLeft + event.deltaY));
      measure();
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [measure]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      // Mouse only. Touch and pen scroll natively, and capturing them here
      // would replace a good native gesture with a worse imitation.
      if (!draggable || event.pointerType !== 'mouse' || event.button !== 0) return;
      const el = ref.current;
      if (!el || el.scrollWidth <= el.clientWidth + 1) return;
      drag.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startScroll: el.scrollLeft,
        moved: false,
      };
    },
    [draggable],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const state = drag.current;
      const el = ref.current;
      if (!state || !el || event.pointerId !== state.pointerId) return;
      const dx = event.clientX - state.startX;
      if (!state.moved) {
        if (Math.abs(dx) < DRAG_THRESHOLD_PX) return;
        state.moved = true;
        // Captured only once the gesture is definitely a drag, so a plain
        // click never has its target stolen.
        el.setPointerCapture(state.pointerId);
        if (draggingClassName) el.classList.add(draggingClassName);
      }
      el.scrollLeft = state.startScroll - dx;
      measure();
    },
    [measure, draggingClassName],
  );

  const endDrag = useCallback(() => {
    const state = drag.current;
    const el = ref.current;
    drag.current = undefined;
    if (!state || !el) return;
    if (state.moved && el.hasPointerCapture(state.pointerId)) {
      el.releasePointerCapture(state.pointerId);
    }
    if (draggingClassName) el.classList.remove(draggingClassName);
    // A drag that happens to end over a chip must not also select it. The flag
    // is read by the capture-phase click handler and cleared on the next frame.
    if (state.moved) {
      el.dataset.dragged = 'true';
      requestAnimationFrame(() => {
        delete el.dataset.dragged;
      });
    }
  }, [draggingClassName]);

  const onClickCapture = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (ref.current?.dataset.dragged) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, []);

  return {
    ref,
    overflow,
    props: {
      onScroll: measure,
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onClickCapture,
    },
  };
}
