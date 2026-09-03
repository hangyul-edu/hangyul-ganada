/**
 * One scroll lock for the whole app, counted rather than saved and restored.
 *
 * ## Two defects, and they are the same defect
 *
 * `Modal` used to do this itself, in its effect: remember
 * `document.body.style.overflow`, set it to `hidden`, and put the remembered
 * value back on the way out. That is the usual recipe and it is wrong here
 * twice over.
 *
 * **It locked the wrong element.** Nothing in this app scrolls the body. The
 * shell hands its `<main>` the height and the `overflow-y: auto` on tabbed
 * screens, and `FocusScreen` gives its middle row the same on learning ones —
 * both marked `data-scroll-region`. Setting `overflow: hidden` on a body that
 * was never a scroller changes nothing a learner can feel: the page behind an
 * open dialog scrolled anyway.
 *
 * **And it corrupted itself when two dialogs overlapped.** Save-and-restore is
 * only correct if dialogs close in the order they opened. Open A, open B —
 * which remembers `hidden`, because A set it — then close **A** first: A puts
 * back the empty string while B is still open, so the page scrolls under an
 * open dialog. Close B, and B puts back `hidden`, on a page with no dialog on
 * it at all. The app is now locked, permanently, and nothing on screen explains
 * why. This is exactly the reference-count corruption a counted lock exists to
 * prevent, and the ordering that produces it is ordinary: a confirmation opened
 * from a sheet, dismissed by the sheet closing under it.
 *
 * So: a count, and the previous values captured once when the count goes from
 * zero to one and restored once when it comes back to zero. Releasing more
 * times than you acquired cannot take the count below zero, because the release
 * a component returns is idempotent — it is the same handle, and using it twice
 * is a bug in the caller, not a reason to unlock a page some other dialog is
 * still using.
 */

/** Everything that scrolls: the shell's main, a focus screen's middle row, the body. */
function scrollers(): HTMLElement[] {
  if (typeof document === 'undefined') return [];
  return [
    document.body,
    ...Array.from(document.querySelectorAll<HTMLElement>('[data-scroll-region]')),
  ];
}

let depth = 0;
/** What each locked element's inline `overflow` was before the first lock. */
let previous: Array<{ element: HTMLElement; overflow: string }> = [];

/**
 * Locks scrolling and returns the one release for this lock.
 *
 * The returned function may be called any number of times; only the first has
 * an effect. That is what makes React's effect cleanup safe here — a cleanup
 * that runs twice under StrictMode, or a component that releases in an effect
 * *and* in a handler, must not unlock a page another dialog is still holding.
 */
export function lockScroll(): () => void {
  if (depth === 0) {
    previous = scrollers().map((element) => ({ element, overflow: element.style.overflow }));
    for (const { element } of previous) element.style.overflow = 'hidden';
  }
  depth += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    depth -= 1;
    if (depth > 0) return;
    depth = 0;
    for (const { element, overflow } of previous) element.style.overflow = overflow;
    previous = [];
  };
}

/** How many locks are held. Exported for tests and for nothing else. */
export function scrollLockDepth(): number {
  return depth;
}
