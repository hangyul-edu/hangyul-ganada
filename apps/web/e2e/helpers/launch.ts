import { expect, type Page } from '@playwright/test';

/**
 * Waits for the launch screen to leave before the test touches anything.
 *
 * ## Why this has to exist
 *
 * `ui/LaunchSplash` covers the whole app for a 900 ms minimum on every cold
 * load of every route, and it deliberately **owns pointer events while it is
 * visible**. That is the correct product behaviour and not a bug to route
 * around: a tap during the brand screen must not fall through and start a
 * lesson the learner cannot see. Only once the splash begins to leave does it
 * take `pointer-events: none`, so the app underneath is never both hidden and
 * clickable.
 *
 * Most of the suite never notices, because Playwright's actionability checks
 * include "the element actually receives pointer events" — a `click()` simply
 * retries until the splash is gone. The raw `page.mouse.*` API has no such
 * check. It dispatches at a coordinate, whatever is on top of it receives the
 * event, and the test carries on believing it interacted with the app.
 *
 * That is exactly how `activity.spec.ts` came to assert that a wheel over the
 * range row does nothing: the wheel landed on the splash `<img>`. Measured, the
 * element at the row's centre is the splash at 0, 200 and 400 ms and the chip
 * from about 600 ms; wheeling after the splash has gone scrolls the row 54 px,
 * as designed. The feature was never broken.
 *
 * So: any test that drives the mouse directly, measures a bounding box it is
 * about to dispatch into, or asserts that an interaction had *no* effect, has
 * to wait here first. Otherwise it is testing the brand screen.
 */
export async function waitForLaunch(page: Page): Promise<void> {
  await expect(page.getByTestId('launch-splash')).toHaveCount(0, { timeout: 10_000 });
}

/**
 * `page.goto` followed by `waitForLaunch`.
 *
 * The pairing worth having as one call: every navigation in this suite is a
 * cold load, so every navigation raises the splash again.
 */
export async function openApp(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await waitForLaunch(page);
}

/**
 * Opens today's vocabulary, past the placement prompt if it is offered.
 *
 * ## Why almost every vocabulary spec needs this
 *
 * A learner who has never been placed is asked, once, whether they want words
 * at their level before the first one appears — §13, and `WordSessionPage`.
 * Every Playwright test starts in a fresh browser context, so every one of them
 * is that learner, and every spec that navigated straight to `/words/today`
 * started asserting against a dialog.
 *
 * Skipping is what a test wants in almost every case: the prompt is not the
 * subject, and "start at Level 1" is the state the suite was implicitly in
 * before the prompt existed. The flow itself is covered by
 * `store/placement.test.tsx` and by the placement cases in `journey.spec.ts`.
 *
 * Tolerant of the prompt being absent, because a spec that has already been
 * through it once in the same context will not see it again — that is the
 * point of recording the decision.
 *
 * ## Why it waits rather than looks
 *
 * `isVisible()` answers about the instant it is called, and the dialog arrives
 * a beat after the launch screen clears — the plan has to resolve before the
 * page knows whether to ask. Asking instantly won the race often enough to
 * look correct and lost it often enough to be the worst kind of flake: the
 * walk in `locale-quiz.spec.ts` clicks the last button on screen to move on,
 * that button was *Take the level test*, and the test wandered into a
 * thirty-question assessment and reported "no question appeared" — in a
 * different locale each run, because which button is last depends on the
 * reading direction.
 *
 * So it waits, briefly, and treats the timeout as "there was no prompt".
 */
export async function openTodaysWords(page: Page, path = '/words/today'): Promise<void> {
  await page.goto(path);
  await waitForLaunch(page);
  const skip = page.getByTestId('placement-skip');
  await skip.waitFor({ state: 'visible', timeout: 4000 }).catch(() => {});
  if (await skip.isVisible().catch(() => false)) await skip.click();
}
