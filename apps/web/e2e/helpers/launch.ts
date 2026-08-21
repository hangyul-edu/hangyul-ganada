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
