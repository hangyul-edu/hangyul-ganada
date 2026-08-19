import { expect, test, type Page } from '@playwright/test';

/**
 * The writing comes before the demonstration of it.
 *
 * ## The bug this defends against
 *
 * The Trace step opened on an animation. Header, step trail, instruction,
 * glyph, romanisation, pronunciation note, stroke-order demonstration, replay
 * button, stroke count — and only then the box the learner was supposed to
 * write in. On a 667pt phone that put the canvas below the fold: the screen
 * whose entire job is "write this" began by asking the learner to scroll past
 * something they could only watch.
 *
 * ## Why it is measured rather than described
 *
 * DOM order alone would not have caught it — the canvas was always in the
 * document. What was wrong was where it landed on a real viewport, so that is
 * what is asserted: the canvas and the Check button inside the shortest common
 * phone screen, without scrolling, on the step that needs them.
 */

const SHORT_PHONE = { width: 390, height: 667 };

/** Opens a letter lesson and steps through to the Trace canvas. */
async function openTrace(page: Page) {
  await page.goto('/letters/lesson-vowels-core');

  /*
   * Every step waits for its control to be *visible* before clicking it.
   *
   * `count()` on a freshly loaded page answers about the DOM, not about React
   * having attached anything to it — so a click can land on a real button and
   * do nothing at all, and the failure then shows up sixty seconds later on the
   * step after. Playwright's actionability wait is the thing that makes this
   * reliable, and it only applies if the locator is awaited rather than
   * counted.
   */
  const unitContinue = page.getByRole('button', { name: /Got it/ });
  await expect(unitContinue).toBeVisible();
  await unitContinue.click();

  const trace = page.getByRole('button', { name: /Trace it/ });
  await expect(trace).toBeVisible();
  await trace.click();

  await expect(page.getByTestId('writing-canvas')).toBeVisible();
}

/** The Check button, which is the step's primary action. */
const check = (page: Page) => page.getByRole('button', { name: /^Check$/ });

test.describe('the writing comes first', () => {
  test.use({ viewport: SHORT_PHONE });

  test('opens with the canvas and Check in view, on the shortest phone', async ({ page }) => {
    await openTrace(page);

    const canvas = (await page.getByTestId('writing-canvas').boundingBox())!;
    expect(canvas.y).toBeGreaterThanOrEqual(0);
    expect(canvas.y + canvas.height).toBeLessThanOrEqual(SHORT_PHONE.height);

    // The primary action too: writing you cannot submit is not much better than
    // writing you cannot reach.
    const action = (await check(page).boundingBox())!;
    expect(action.y + action.height).toBeLessThanOrEqual(SHORT_PHONE.height);
  });

  test('puts the stroke demonstration after the canvas, not before it', async ({ page }) => {
    await openTrace(page);

    const order = await page.evaluate(() => {
      const canvas = document.querySelector('[data-testid="writing-canvas"]')!;
      const demo = document.querySelector('figure')!;
      return {
        demoFollowsCanvas: !!(
          canvas.compareDocumentPosition(demo) & Node.DOCUMENT_POSITION_FOLLOWING
        ),
        demoTop: demo.getBoundingClientRect().top,
        canvasTop: canvas.getBoundingClientRect().top,
      };
    });

    // Both orders, because a screen reader follows one and the eye the other.
    expect(order.demoFollowsCanvas).toBe(true);
    expect(order.demoTop).toBeGreaterThan(order.canvasTop);
  });

  test('still offers the demonstration, further down', async ({ page }) => {
    await openTrace(page);
    // Moved, not removed: still the real thing, with a replay control.
    await expect(page.getByRole('button', { name: /Watch again|Pause/ })).toBeAttached();
  });
});
