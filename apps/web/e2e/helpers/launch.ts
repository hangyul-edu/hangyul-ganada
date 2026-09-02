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
 * Waits until a row has actually reached IndexedDB.
 *
 * ## Why a reload needs this and a click does not
 *
 * The stores are written optimistically: React's state updates and the write is
 * started without being awaited — `void repo.put(row)`. That is the right trade
 * for a tap, because the screen must not wait on a disk to advance. It means
 * the in-memory state and the stored row are briefly out of step, and a
 * `page.goto` or a `page.reload()` fired inside that window aborts the
 * transaction and reloads a record that never got the event.
 *
 * A person cannot hit that window — tapping and killing the app inside one
 * IndexedDB transaction is not a thing hands do — but Playwright hits it
 * whenever the machine is busy. That is why `N-e2e-4` passed alone and failed
 * inside its own spec, and why the review hub's save test passed alone, passed
 * in order, and failed once in a 368-test run.
 *
 * The wait is on the *storage*, so a test that uses it still proves what it was
 * written to prove: that what comes back after a navigation came from the
 * record and not from anything the previous screen was holding.
 */
export async function waitForStoredRow(
  page: Page,
  store: string,
  key: string,
  holds: (row: never) => boolean,
  what = `${store}/${key}`,
): Promise<void> {
  await expect
    .poll(
      async () => {
        const row = await page.evaluate(
          async ({ store, key }) => {
            const request = indexedDB.open('hangyul-ganada');
            const db: IDBDatabase = await new Promise((resolve, reject) => {
              request.onsuccess = () => resolve(request.result);
              request.onerror = () => reject(request.error);
            });
            try {
              return await new Promise<unknown>((resolve) => {
                const read = db.transaction(store, 'readonly').objectStore(store).get(key);
                read.onsuccess = () => resolve(read.result ?? null);
                read.onerror = () => resolve(null);
              });
            } finally {
              db.close();
            }
          },
          { store, key },
        );
        // A boolean rather than the row: `expect.poll` has `toBe` and no
        // `toSatisfy`, and the predicate belongs to the caller either way.
        return Boolean(row) && holds(row as never);
      },
      { timeout: 10_000, message: `the stored row for ${what} never satisfied the wait` },
    )
    .toBe(true);
}

/**
 * `waitForStoredRow` for a Numbers lesson.
 *
 * `NumbersRepository.put` keys rows `lesson:<id>`, not by the bare id — see
 * `storage/repositories.ts`.
 */
export async function waitForNumbersRecord(
  page: Page,
  lessonId: string,
  holds: (record: { explanation_steps_viewed?: string[] }) => boolean,
): Promise<void> {
  await waitForStoredRow(
    page,
    'numbers',
    `lesson:${lessonId}`,
    holds as (row: never) => boolean,
    `the ${lessonId} lesson`,
  );
}

/**
 * `waitForStoredRow` for a saved word.
 *
 * Saved words are not their own store: they are `saved_items` on the settings
 * row, because the list is small and belongs to the profile rather than to the
 * corpus. See `storage/schema.ts`.
 */
export async function waitForSavedWord(page: Page, wordId: string): Promise<void> {
  await waitForStoredRow(
    page,
    'settings',
    'preferences',
    ((row: { saved_items?: string[] }) => (row.saved_items ?? []).includes(wordId)) as (
      row: never,
    ) => boolean,
    `${wordId} on the saved list`,
  );
}
