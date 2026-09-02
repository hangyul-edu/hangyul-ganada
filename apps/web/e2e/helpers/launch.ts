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

/**
 * Waits until a Numbers lesson's record has actually reached IndexedDB.
 *
 * ## Why a reload needs this and a click does not
 *
 * `recordNumbersEvent` updates React's state and starts the write without
 * awaiting it — `void numbersRepo.current?.put(after)`. That is the right
 * trade for a tap: the screen must not wait on a disk to advance. It means the
 * in-memory state and the stored row are briefly out of step, and a
 * `page.reload()` fired in that window aborts the transaction and reloads a
 * record that never got the event.
 *
 * A person cannot hit that window — tapping *Next* and killing the app inside
 * one IndexedDB transaction is not a thing hands do — but Playwright hits it
 * whenever the machine is busy, which is why `N-e2e-4` passed alone and failed
 * inside the full spec. The wait is on the *storage*, so the test still proves
 * what it was written to prove: that the resume comes from the record and not
 * from anything the screen was holding.
 */
export async function waitForNumbersRecord(
  page: Page,
  lessonId: string,
  holds: (record: { explanation_steps_viewed?: string[] }) => boolean,
): Promise<void> {
  await expect
    .poll(
      async () => {
        const record = await page.evaluate(async (id) => {
          const request = indexedDB.open('hangyul-ganada');
          const db: IDBDatabase = await new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          try {
            return await new Promise<unknown>((resolve) => {
              // `NumbersRepository.put` keys rows `lesson:<id>`, not by the
              // bare id — see `storage/repositories.ts`.
              const read = db.transaction('numbers', 'readonly').objectStore('numbers').get(`lesson:${id}`);
              read.onsuccess = () => resolve(read.result ?? null);
              read.onerror = () => resolve(null);
            });
          } finally {
            db.close();
          }
        }, lessonId);
        // A boolean rather than the row: `expect.poll` has `toBe` and no
        // `toSatisfy`, and the predicate belongs to the caller either way.
        return Boolean(record) && holds(record as { explanation_steps_viewed?: string[] });
      },
      { timeout: 10_000, message: `the stored record for ${lessonId} never satisfied the wait` },
    )
    .toBe(true);
}
