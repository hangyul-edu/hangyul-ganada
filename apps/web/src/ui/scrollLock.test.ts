import { beforeEach, describe, expect, it } from 'vitest';

import { lockScroll, scrollLockDepth } from './scrollLock';

/**
 * The lock a learner never sees until it is wrong.
 *
 * Two failures are asserted here because both had shipped: a lock that held the
 * wrong element, so a page scrolled behind an open dialog; and a save-and-
 * restore that left the app permanently unscrollable when two dialogs closed in
 * the order they were actually closed in rather than the order somebody assumed.
 */

function scrollRegion(name: string): HTMLElement {
  const element = document.createElement('div');
  element.dataset.scrollRegion = name;
  element.style.overflow = 'auto';
  document.body.append(element);
  return element;
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.body.style.overflow = '';
  // Release anything a previous test left held.
  while (scrollLockDepth() > 0) lockScroll()();
  document.body.style.overflow = '';
});

describe('locking the page', () => {
  it('locks what actually scrolls, not only the body', () => {
    /*
     * Nothing in this app scrolls the body. `AppShell` gives its `<main>` the
     * height and the overflow, and `FocusScreen` gives its middle row the same;
     * both are marked. A lock that reached only the body was a no-op a reviewer
     * could not see, because the *dialog* looked right either way.
     */
    const shell = scrollRegion('shell');
    const focus = scrollRegion('focus');

    const release = lockScroll();

    expect(shell.style.overflow).toBe('hidden');
    expect(focus.style.overflow).toBe('hidden');
    expect(document.body.style.overflow).toBe('hidden');

    release();

    expect(shell.style.overflow).toBe('auto');
    expect(focus.style.overflow).toBe('auto');
    expect(document.body.style.overflow).toBe('');
  });

  it('stays locked while a second dialog is open, whichever closes first', () => {
    /*
     * The corruption, exactly as it happened: a confirmation opened from a
     * sheet, and the sheet closed under it. Save-and-restore put back the value
     * the *second* lock had remembered — "hidden", because the first lock had
     * just set it — onto a page with no dialog left on it.
     */
    const shell = scrollRegion('shell');

    const first = lockScroll();
    const second = lockScroll();
    expect(scrollLockDepth()).toBe(2);

    first(); // the outer one closes first — the order that used to break it
    expect(shell.style.overflow, 'still locked: a dialog is open').toBe('hidden');

    second();
    expect(shell.style.overflow, 'unlocked once the last dialog closed').toBe('auto');
    expect(scrollLockDepth()).toBe(0);
  });

  it('ignores a release used twice, rather than unlocking somebody else’s dialog', () => {
    // React can run an effect cleanup twice; a component can release in a
    // cleanup and in a handler. Neither may unlock a page another dialog holds.
    const shell = scrollRegion('shell');

    const first = lockScroll();
    const second = lockScroll();
    first();
    first();
    first();

    expect(scrollLockDepth()).toBe(1);
    expect(shell.style.overflow).toBe('hidden');

    second();
    expect(shell.style.overflow).toBe('auto');
  });

  it('restores the inline value each element actually had', () => {
    const shell = scrollRegion('shell');
    shell.style.overflow = 'scroll';
    document.body.style.overflow = 'clip';

    const release = lockScroll();
    release();

    expect(shell.style.overflow).toBe('scroll');
    expect(document.body.style.overflow).toBe('clip');
  });
});
