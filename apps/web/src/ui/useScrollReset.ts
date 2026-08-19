import { useLayoutEffect, type RefObject } from 'react';

/**
 * A new page, or a new learning item, starts at the top.
 *
 * ## Why this is not `window.scrollTo(0, 0)`
 *
 * Nothing in this app scrolls the window. The shell is a fixed phone-shaped
 * frame; a tabbed screen scrolls inside `AppShell`'s `<main>`, and a learning
 * screen scrolls inside `FocusScreen`'s middle row, which exists precisely so
 * the action footer can stay pinned while the content moves. Scrolling the
 * window scrolls something that is already at zero, which is why the symptom
 * was so easy to miss: the call succeeds and the screen still opens halfway
 * down.
 *
 * So the reset is done by the two components that actually own a scroll box,
 * each on the key that means "this is a different thing now".
 *
 * ## The rule, deliberately simple
 *
 * A different route, or a different item within a lesson, starts at the top.
 * Everything else leaves the scroll position alone: opening a sheet, closing a
 * modal, answering a question, a re-render, changing the theme. Browser-style
 * scroll restoration — putting the learner back where they were when they
 * return to a list — is not implemented and is not wanted here: a lesson is a
 * sequence of single screens, and the surprise of arriving mid-screen costs
 * more than the convenience of not scrolling back.
 *
 * ## Why layout effect
 *
 * It runs before the browser paints, so the new screen is never *seen*
 * scrolled. A `useEffect` produces a visible jump on a slow device, which reads
 * as a bug even though the position ends up right.
 */
export function useScrollReset(ref: RefObject<HTMLElement | null>, key: string): void {
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    // `scrollTop = 0` rather than `scrollTo({ behavior: 'smooth' })`: this is
    // not a movement the learner asked for, and animating it would show them
    // the previous screen's content sliding past on the way.
    element.scrollTop = 0;
    element.scrollLeft = 0;
  }, [ref, key]);
}
