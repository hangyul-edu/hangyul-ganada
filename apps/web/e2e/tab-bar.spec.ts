import { expect, test, type Page } from '@playwright/test';

import { openApp } from './helpers/launch';

/**
 * The bottom tab bar does not move, and the document does not scroll.
 *
 * ## The reported defect
 *
 * A My Learning screenshot in which the page had kept moving past its content,
 * carrying the tab bar up with it and leaving a band of blank ground below it.
 *
 * The cause was one hidden checkbox. `.toggleInput` is `position: absolute`
 * with no offsets — the ordinary way to keep a real control focusable while a
 * styled track draws it — and its label was not positioned, so its containing
 * block walked all the way up to `#root`. An absolutely positioned box is
 * clipped by an ancestor only when that ancestor is in its containing-block
 * chain, so the scrolling pane's `overflow: hidden` did not clip it: two of
 * them sat at document y≈1908 and y≈1960 and stretched the document to 1,961 px
 * against an 844 px window. A scrollable document carries the whole app when it
 * moves, tab bar included.
 *
 * ## What is asserted, and why it is measured rather than clicked
 *
 * The tab bar's viewport rectangle before and after a real wheel gesture, to
 * the pixel. Playwright's `locator.click()` scrolls an element into view first,
 * which is how a suite can pass on a page whose scrolling is broken; nothing
 * here relies on it.
 *
 * The document's own scroll position is asserted at 0 with a scrollHeight equal
 * to its client height — the structural claim, which is what makes the class of
 * defect impossible rather than this instance of it fixed.
 */

const SIZES = [
  { name: '320×568', width: 320, height: 568 },
  { name: '360×640', width: 360, height: 640 },
  { name: '360×800', width: 360, height: 800 },
  { name: '390×844', width: 390, height: 844 },
  { name: '412×915', width: 412, height: 915 },
  { name: '430×932', width: 430, height: 932 },
  { name: '740×360 landscape', width: 740, height: 360 },
];

/** The five screens that carry the tab bar. */
const TABBED = ['/', '/letters', '/words', '/review', '/me'];

type Reading = {
  nav: { x: number; y: number; width: number; height: number; bottom: number } | null;
  doc: { top: number; height: number; client: number };
  pane: { top: number; height: number; client: number } | null;
  viewport: { width: number; height: number };
  blankBelowNav: number | null;
};

async function measure(page: Page): Promise<Reading> {
  return page.evaluate(() => {
    const nav = document.querySelector('nav');
    const pane = document.querySelector('[data-scroll-region]') as HTMLElement | null;
    const de = document.scrollingElement as HTMLElement;
    const rect = nav?.getBoundingClientRect();
    return {
      nav: rect
        ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height, bottom: rect.bottom }
        : null,
      doc: { top: de.scrollTop, height: de.scrollHeight, client: de.clientHeight },
      pane: pane
        ? { top: pane.scrollTop, height: pane.scrollHeight, client: pane.clientHeight }
        : null,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      /*
       * What is painted between the bar's bottom edge and the bottom of the
       * *app frame* — not of the window.
       *
       * On a wide screen the app is a 430 px phone centred in the browser with
       * warm ground around it, so measuring against `window.innerHeight` counts
       * that surround as blank canvas and fails a layout that is correct. The
       * claim is about the app: nothing unpainted between the tab bar and the
       * bottom of the shell.
       */
      blankBelowNav: rect
        ? (document.getElementById('root')?.getBoundingClientRect().bottom ?? window.innerHeight) - rect.bottom
        : null,
    };
  });
}

/** Wheels until the scroll position stops changing — a finger, not the driver. */
async function scrollToEnd(page: Page): Promise<void> {
  let previous = -1;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const at = await measure(page);
    const position = at.pane?.top ?? at.doc.top;
    if (position === previous) return;
    previous = position;
    await page.mouse.move(at.viewport.width / 2, at.viewport.height / 2);
    await page.mouse.wheel(0, at.viewport.height);
    await page.waitForTimeout(70);
  }
}

test.describe('the bottom tab bar', () => {
  for (const size of SIZES) {
    for (const scheme of ['light', 'dark'] as const) {
      for (const scale of scheme === 'light' ? [1, 1.5, 2] : [1]) {
        test(`stays put on My Learning — ${size.name}, text ×${scale}, ${scheme}`, async ({ page }) => {
          await page.setViewportSize({ width: size.width, height: size.height });
          await page.emulateMedia({ colorScheme: scheme });
          if (scale !== 1) {
            await page.addInitScript((factor) => {
              document.documentElement.style.fontSize = `${16 * factor}px`;
            }, scale);
          }
          await openApp(page, '/me');
          await page.waitForTimeout(400);

          const before = await measure(page);
          expect(before.nav, 'My Learning draws a tab bar').not.toBeNull();

          await scrollToEnd(page);
          const after = await measure(page);

          // 1 · the bar has not moved, to the pixel.
          expect(after.nav!.y).toBeCloseTo(before.nav!.y, 0);
          expect(after.nav!.bottom).toBeCloseTo(before.nav!.bottom, 0);
          expect(after.nav!.x).toBeCloseTo(before.nav!.x, 0);

          // 2 · the document never scrolled, and never could.
          expect(after.doc.top).toBe(0);
          expect(after.doc.height).toBeLessThanOrEqual(after.doc.client + 1);

          // 3 · the pane owns the scroll and stopped at its own bottom.
          expect(after.pane).not.toBeNull();
          expect(after.pane!.top).toBeGreaterThan(0);
          expect(after.pane!.top + after.pane!.client).toBeLessThanOrEqual(after.pane!.height + 1);

          // 4 · nothing blank under the bar.
          expect(after.blankBelowNav).toBeLessThanOrEqual(1);
        });
      }
    }
  }

  test('every tab keeps the bar in the same place, and each still navigates after a scroll', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openApp(page, '/me');
    await page.waitForTimeout(400);
    const anchor = (await measure(page)).nav!;

    for (const path of TABBED) {
      await openApp(page, path);
      await page.waitForTimeout(300);
      await scrollToEnd(page);
      const at = await measure(page);
      expect(at.nav!.y, `${path}: the bar moved`).toBeCloseTo(anchor.y, 0);
      expect(at.doc.top, `${path}: the document scrolled`).toBe(0);
      expect(at.blankBelowNav, `${path}: blank ground under the bar`).toBeLessThanOrEqual(1);
    }

    // Scrolled to the bottom of My Learning, every tab still goes where it says.
    await openApp(page, '/me');
    await scrollToEnd(page);
    const tabs = page.locator('nav a');
    const count = await tabs.count();
    expect(count).toBeGreaterThanOrEqual(5);
    for (let i = 0; i < count; i += 1) {
      const href = await tabs.nth(i).getAttribute('href');
      await tabs.nth(i).click();
      await page.waitForTimeout(400);
      expect(new URL(page.url()).pathname).toBe(href);
    }
  });

  test('a tab opened after another was scrolled starts at its own top', async ({ page }) => {
    // The scroll position of one page must not arrive on the next one.
    await page.setViewportSize({ width: 390, height: 844 });
    await openApp(page, '/me');
    await scrollToEnd(page);
    expect((await measure(page)).pane!.top).toBeGreaterThan(0);

    await page.locator('nav a[href="/review"]').click();
    await page.waitForTimeout(500);
    expect((await measure(page)).pane!.top).toBe(0);
  });

  test('opening and closing a dialog leaves the bar and the scroll where they were', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openApp(page, '/me');
    await scrollToEnd(page);
    const before = await measure(page);

    await page.getByTestId('settings-reset-open').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    const during = await measure(page);
    expect(during.nav!.y).toBeCloseTo(before.nav!.y, 0);

    await page.getByTestId('reset-cancel').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const after = await measure(page);
    expect(after.nav!.y).toBeCloseTo(before.nav!.y, 0);
    expect(after.pane!.top).toBeCloseTo(before.pane!.top, 0);
    // And the pane still scrolls: a lock that did not release is invisible
    // until somebody tries to move.
    await page.mouse.move(195, 400);
    await page.mouse.wheel(0, -400);
    await page.waitForTimeout(150);
    expect((await measure(page)).pane!.top).toBeLessThan(before.pane!.top);
  });
});
