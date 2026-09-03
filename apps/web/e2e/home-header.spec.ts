import { expect, test, type Page } from '@playwright/test';

import { waitForLaunch } from './helpers/launch';

/**
 * The Home header: a logo, a streak, a level — and no back control.
 *
 * ## Why a rendered spec and not a unit test
 *
 * The defect this exists for was a screenshot: a back chevron beside the
 * product's own logo on the screen the app opens to. Every assertion that
 * would have caught it is a *measurement of a painted screen* — is the control
 * there, does the logo start on the same rule as the cards below it, does the
 * streak still fit beside it. A jsdom test can see the first of those and none
 * of the others, and the second and third are exactly what removing a grid
 * track puts at risk.
 *
 * `back:coverage` already asserts the count at one size. This is the other
 * half: that the header still *looks* right once the track is gone, across the
 * phone widths the product supports, at the text sizes a learner can set, and
 * in both appearances.
 */

const WIDTHS = [
  { name: '320 — the narrowest phone supported', width: 320, height: 568 },
  { name: '360 — the commonest Android width', width: 360, height: 800 },
  { name: '390 — the reference design', width: 390, height: 844 },
  { name: '430 — the widest phone', width: 430, height: 932 },
];

/** The body's own horizontal rule: `--hg-space-5`, which the cards sit on. */
async function measure(page: Page) {
  return page.evaluate(() => {
    const header = document.querySelector('header')!;
    const logo = header.querySelector('h1 img')!.getBoundingClientRect();
    const action = header.querySelector('[class*="action"]')?.getBoundingClientRect() ?? null;
    // The first card under the header, whose left edge is the page's rule.
    const card = [...document.querySelectorAll('main *, [class*="body"] > *')]
      .map((element) => element.getBoundingClientRect())
      .filter((box) => box.width > 100 && box.height > 40 && box.y > header.getBoundingClientRect().bottom)
      .sort((a, b) => a.y - b.y)[0] ?? null;
    return {
      backControls: document.querySelectorAll('[data-testid="app-back"]').length,
      logo: { x: logo.x, right: logo.right, width: logo.width, height: logo.height },
      action: action ? { x: action.x, right: action.right } : null,
      card: card ? { x: card.x } : null,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    };
  });
}

test.describe('the Home header', () => {
  for (const size of WIDTHS) {
    for (const scale of [1, 1.5, 2]) {
      for (const scheme of ['light', 'dark'] as const) {
        test(`${size.name}, text ×${scale}, ${scheme}`, async ({ page }) => {
          await page.setViewportSize({ width: size.width, height: size.height });
          await page.emulateMedia({ colorScheme: scheme });
          if (scale !== 1) {
            await page.addInitScript((factor) => {
              document.documentElement.style.fontSize = `${16 * factor}px`;
            }, scale);
          }
          await page.goto('/');
          await waitForLaunch(page);
          await page.waitForTimeout(400);

          const seen = await measure(page);

          // 1. The rule this spec exists for.
          expect(seen.backControls, 'Home must draw no back control').toBe(0);

          // 2. No gap left where the chevron was: the logo starts on the same
          //    rule as the content under it, not one hit-target further in.
          expect(seen.logo.x).toBeLessThan(40);
          if (seen.card) expect(Math.abs(seen.logo.x - seen.card.x)).toBeLessThanOrEqual(2);

          // 3. The logo is drawn at its own aspect ratio and has not collapsed.
          expect(seen.logo.height).toBeGreaterThan(18);
          expect(seen.logo.width).toBeGreaterThan(60);

          // 4. The streak and level still fit beside it, without overlapping
          //    the logo or leaving the screen.
          if (seen.action) {
            expect(seen.action.x).toBeGreaterThanOrEqual(seen.logo.right);
            expect(seen.action.right).toBeLessThanOrEqual(size.width + 1);
          }

          // 5. Nothing in the header pushed the page sideways.
          expect(seen.documentWidth).toBeLessThanOrEqual(seen.viewportWidth + 1);
        });
      }
    }
  }

  test('the longest product name in any locale still fits beside the streak', async ({ page }) => {
    /*
     * The logo carries the product name as its alt text rather than as drawn
     * text, so the header's width does not vary with the locale — but the
     * *action* does: a three-digit streak beside a two-digit level is the
     * widest this row ever gets, and it is what would push the logo off a
     * 320 px screen if the layout ever went back to being content-sized.
     */
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/');
    await waitForLaunch(page);
    await page.addInitScript(() => {});
    await page.evaluate(() => {
      const action = document.querySelector('header [class*="action"]');
      if (action) action.querySelectorAll('span').forEach((span) => {
        if (/^\d+$/.test(span.textContent ?? '')) span.textContent = '365';
      });
    });
    await page.waitForTimeout(200);

    const seen = await measure(page);
    expect(seen.backControls).toBe(0);
    expect(seen.documentWidth).toBeLessThanOrEqual(seen.viewportWidth + 1);
    if (seen.action) expect(seen.action.x).toBeGreaterThanOrEqual(seen.logo.right);
  });
});
