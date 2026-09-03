import { expect, test, type Page } from '@playwright/test';

import { openApp, waitForLaunch } from './helpers/launch';

/**
 * Privacy, entered a hundred ways, and still Privacy.
 *
 * ## The report
 *
 * The page sometimes renders correctly and sometimes breaks near the bottom
 * after scrolling. An earlier pass could not reproduce it from a direct visit
 * and recorded it as *not reproduced*, which is the wrong shape of answer for
 * an intermittent fault: a single visit tests one entry path out of a dozen,
 * and the ones that matter are the ones that arrive carrying state.
 *
 * ## What is actually checked
 *
 * Three properties, after every entry, and again after scrolling to the end:
 *
 * 1. **The page is only itself.** No settings group — the marker `MyPage`
 *    stamps on every group it draws — and no pronunciation-voice copy in any
 *    language. This is the leak `legal:isolation` guards statically; here it is
 *    re-checked after a *navigation*, which is when shared DOM survives.
 * 2. **One scroll owner, clamped.** Exactly one `[data-scroll-region]`, the
 *    document at `scrollTop` 0, and the pane's offset never past its own range
 *    — a restored offset larger than the new page's height is how a short page
 *    ends up showing its own footer against blank ground.
 * 3. **The tab bar has not moved and nothing blank is under it.**
 *
 * Entry paths are deliberately the ones that carry something in: a deep link, a
 * walk from a scrolled My Learning, a return through Back, a reload while on
 * the page, a locale change before and during, and a dialog opened and closed
 * first. Each is run repeatedly, because *sometimes* is the whole complaint.
 */

type Reading = {
  groups: number;
  voice: number;
  regions: number;
  docTop: number;
  docOverflow: string;
  bodyOverflow: string;
  pane: { top: number; height: number; client: number } | null;
  nav: { y: number; bottom: number } | null;
  blankBelowNav: number | null;
  lastTextBottom: number | null;
  viewport: { width: number; height: number };
};

async function read(page: Page): Promise<Reading> {
  return page.evaluate(() => {
    const nav = document.querySelector('nav');
    const navRect = nav?.getBoundingClientRect();
    const panes = [...document.querySelectorAll('[data-scroll-region]')] as HTMLElement[];
    const pane = panes[0] ?? null;
    const de = document.scrollingElement as HTMLElement;
    // The last painted line of the page's own prose.
    const paragraphs = [...document.querySelectorAll('main p, main li')];
    const last = paragraphs[paragraphs.length - 1];
    return {
      groups: document.querySelectorAll('[data-settings-group]').length,
      voice: document.querySelectorAll('[class*="voiceOption"], [class*="voiceCheck"]').length,
      regions: panes.length,
      docTop: de.scrollTop,
      docOverflow: getComputedStyle(document.documentElement).overflow,
      bodyOverflow: getComputedStyle(document.body).overflow,
      pane: pane ? { top: pane.scrollTop, height: pane.scrollHeight, client: pane.clientHeight } : null,
      nav: navRect ? { y: navRect.y, bottom: navRect.bottom } : null,
      blankBelowNav: navRect ? window.innerHeight - navRect.bottom : null,
      lastTextBottom: last ? last.getBoundingClientRect().bottom : null,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  });
}

async function scrollToEnd(page: Page): Promise<void> {
  let previous = -1;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const at = await read(page);
    const position = at.pane?.top ?? at.docTop;
    if (position === previous) return;
    previous = position;
    await page.mouse.move(at.viewport.width / 2, at.viewport.height / 2);
    await page.mouse.wheel(0, at.viewport.height);
    await page.waitForTimeout(60);
  }
}

/** Everything that must be true of Privacy, whatever brought the learner here. */
async function assertSound(page: Page, where: string, atBottom = false): Promise<void> {
  const at = await read(page);
  expect(at.groups, `${where}: a settings group leaked into Privacy`).toBe(0);
  expect(at.voice, `${where}: pronunciation-voice content leaked into Privacy`).toBe(0);
  expect(at.regions, `${where}: ${at.regions} scroll regions, not one`).toBe(1);
  expect(at.docTop, `${where}: the document scrolled`).toBe(0);
  expect(at.docOverflow, `${where}: the document became scrollable`).toBe('hidden');
  expect(at.bodyOverflow, `${where}: the body became scrollable`).toBe('hidden');
  expect(at.pane, `${where}: no scroll region`).not.toBeNull();
  // A restored offset past the end of a shorter page is the corruption.
  expect(at.pane!.top, `${where}: scrolled past the page`).toBeLessThanOrEqual(
    Math.max(0, at.pane!.height - at.pane!.client) + 1,
  );
  expect(at.nav, `${where}: no tab bar`).not.toBeNull();
  expect(at.blankBelowNav!, `${where}: blank ground under the tab bar`).toBeLessThanOrEqual(1);
  /*
   * Only once the learner has scrolled to the end. Before that the last
   * paragraph is legitimately below the fold — that is what scrolling is for —
   * and asserting otherwise would be asserting that the page is short.
   */
  if (atBottom && at.lastTextBottom !== null) {
    expect(at.lastTextBottom, `${where}: the last line is under the tab bar`).toBeLessThanOrEqual(at.nav!.y + 1);
  }
}

const ENTRIES: Array<{ name: string; go: (page: Page) => Promise<void> }> = [
  {
    name: 'deep link',
    go: async (page) => { await openApp(page, '/me/privacy'); },
  },
  {
    name: 'from My Learning',
    go: async (page) => {
      await openApp(page, '/me');
      await page.getByRole('link', { name: /Privacy|개인정보/ }).click();
    },
  },
  {
    name: 'from My Learning scrolled to the bottom',
    go: async (page) => {
      await openApp(page, '/me');
      await scrollToEnd(page);
      await page.getByRole('link', { name: /Privacy|개인정보/ }).click();
    },
  },
  {
    name: 'after a dialog was opened and closed',
    go: async (page) => {
      await openApp(page, '/me');
      await page.getByTestId('settings-reset-open').click();
      await page.getByTestId('reset-cancel').click();
      await scrollToEnd(page);
      await page.getByRole('link', { name: /Privacy|개인정보/ }).click();
    },
  },
  {
    name: 'back and forward',
    go: async (page) => {
      await openApp(page, '/me');
      await scrollToEnd(page);
      await page.getByRole('link', { name: /Privacy|개인정보/ }).click();
      await page.waitForTimeout(300);
      await page.goBack();
      await waitForLaunch(page);
      await page.waitForTimeout(300);
      await page.goForward();
      await waitForLaunch(page);
    },
  },
  {
    name: 'reloaded while on Privacy',
    go: async (page) => {
      await openApp(page, '/me/privacy');
      await scrollToEnd(page);
      await page.reload();
      /*
       * The launch overlay comes back on a reload and swallows input for 900 ms.
       * Without this the wheel gesture below lands on the splash, the pane never
       * moves, and the harness reports a product defect it caused itself.
       */
      await waitForLaunch(page);
    },
  },
];

test.describe('Privacy is stable however it is reached', () => {
  test('every entry path, repeatedly, at three sizes', async ({ page }) => {
    /*
     * 6 paths × 3 sizes × 6 repetitions = 108 entries, each measured on arrival
     * and again after scrolling to the end. Deterministic and ordered, so a
     * failure names the path and the repetition rather than "sometimes".
     */
    test.setTimeout(15 * 60 * 1000);
    const sizes = [
      { width: 320, height: 568 },
      { width: 390, height: 844 },
      { width: 430, height: 932 },
    ];
    let entries = 0;
    for (const size of sizes) {
      await page.setViewportSize(size);
      for (let round = 0; round < 6; round += 1) {
        for (const entry of ENTRIES) {
          const where = `${entry.name} @ ${size.width}×${size.height} #${round}`;
          await entry.go(page);
          await page.waitForTimeout(350);
          await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
          await assertSound(page, `${where} on arrival`);
          await scrollToEnd(page);
          await assertSound(page, `${where} at the bottom`, true);
          entries += 1;
        }
      }
    }
    expect(entries).toBe(sizes.length * 6 * ENTRIES.length);
  });

  test('a locale change before and during does not corrupt it', async ({ page }) => {
    for (const locale of ['ko', 'ar', 'de']) {
      await page.addInitScript((l) => localStorage.setItem('hangyul_ganada:locale', l), locale);
      await openApp(page, '/me/privacy');
      await page.waitForTimeout(400);
      await assertSound(page, `locale ${locale} on arrival`);
      await scrollToEnd(page);
      await assertSound(page, `locale ${locale} at the bottom`, true);
    }
  });

  test('entering and leaving repeatedly leaves nothing behind', async ({ page }) => {
    // Portals, listeners and scroll state from one visit must not reach the
    // next: the count of scroll regions and settings groups is the tell.
    await openApp(page, '/me');
    for (let i = 0; i < 12; i += 1) {
      await page.getByRole('link', { name: /Privacy|개인정보/ }).click();
      await page.waitForTimeout(250);
      await assertSound(page, `visit ${i}`);
      await page.goBack();
      await page.waitForTimeout(250);
      expect(await page.evaluate(() => document.querySelectorAll('[data-scroll-region]').length)).toBe(1);
    }
  });
});
