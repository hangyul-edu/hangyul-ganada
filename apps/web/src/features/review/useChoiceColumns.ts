import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

/**
 * Four chips: one row of four, or two rows of two. Never three and one.
 *
 * ## The defect
 *
 * The gap-fill's options were a wrapping flex row, and wrapping is not a
 * layout — it is what happens when there is no layout. Four Korean chips fit
 * on one line at 390 px and not at 360 px, and at 360 px the fourth fell
 * through on its own: three chips and an orphan, which reads as three
 * choices and something else. `ui/optionRows` removed the same shape from the
 * syllable tray; this removes it from the chips.
 *
 * ## The rule
 *
 * Four across **only when all four fit at the actual size** — the rendered
 * width of each chip at the learner's type size, in their language, inside
 * the container as it is on their phone. Otherwise two by two, where each
 * cell may wrap its own text. The decision is a measurement, not a character
 * count: a Korean word's width depends on the face, the size and the device
 * font scale, and none of those are knowable from its length.
 *
 * ## How it is measured without flickering
 *
 * The chips are rendered once, hidden, on a single non-wrapping line, and
 * their widths plus the gaps are compared with the container's width. That
 * happens in `useLayoutEffect`, before the browser paints, so the first frame
 * already has the right answer; a `ResizeObserver` re-measures when the
 * container changes (a rotation, a split screen, a font-scale change), and the
 * columns change only when the answer does. Until the first measurement the
 * layout is two by two — the safe shape — so nothing can paint as three and
 * one even for a frame.
 */
export function useChoiceColumns<T extends HTMLElement, M extends HTMLElement>(
  count: number,
): { containerRef: RefObject<T | null>; measureRef: RefObject<M | null>; columns: 2 | 4 } {
  const containerRef = useRef<T | null>(null);
  const measureRef = useRef<M | null>(null);
  const [fits, setFits] = useState(false);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure || count !== 4) return undefined;

    const decide = () => {
      const available = container.clientWidth;
      // The hidden line is `nowrap`, so its scroll width is exactly what four
      // chips and three gaps need. `available` is what they have.
      const needed = measure.scrollWidth;
      setFits(available > 0 && needed <= available);
    };
    decide();

    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(decide);
    observer.observe(container);
    observer.observe(measure);
    return () => observer.disconnect();
  }, [count]);

  return { containerRef, measureRef, columns: count === 4 && fits ? 4 : 2 };
}
