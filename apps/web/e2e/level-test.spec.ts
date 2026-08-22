import { expect, test, type Page } from '@playwright/test';

import { waitForLaunch } from './helpers/launch';

/**
 * The Hangyul Vocabulary Level Test, as a learner meets it.
 *
 * ## Why an e2e test and not only the unit tests
 *
 * `levelTest.test.ts` proves the estimator, and `leveltest:qa` simulates 6,000
 * sittings against the real bank. Neither of them opens the app. The parts that
 * can only break in a browser are the ones covered here: the bank is fetched
 * lazily from `public/`, so a packaging mistake makes every question fail to
 * arrive; the result is written to IndexedDB, so a schema mistake loses it on
 * reload; and the promises the intro screen makes — no hints, no answers shown,
 * nothing touched — are promises about the DOM.
 *
 * ## Why the test is taken by answering "I don't know"
 *
 * A browser cannot know the right answer without reading the bank, and a test
 * that reads the bank to answer correctly is testing the bank, not the app.
 * "I don't know" is a real answer that the model weighs, it is available on
 * every question, and taking the whole test with it lands at Level 1 — a known
 * endpoint that says the loop ran to completion.
 */

/**
 * Answers "I don't know" until the result appears, and returns the count.
 *
 * The limit is a runaway guard, not an expectation: the test is exactly 30
 * questions now, and a loop that never reached the result would otherwise hang
 * until Playwright's timeout with nothing to say about why.
 */
async function takeIt(page: Page, limit = 40) {
  for (let i = 0; i < limit; i += 1) {
    if (await page.getByTestId('level-result').count()) return i;
    await page.getByTestId('level-unknown').click();
  }
  return limit;
}

test.describe('the vocabulary level test', () => {
  test('places a learner and keeps the result', async ({ page }) => {
    await page.goto('/me');
    await waitForLaunch(page);

    // Reachable from My page, and described before it is started.
    await page.getByRole('link', { name: /Vocabulary Level/i }).click();
    await expect(page).toHaveURL(/\/me\/level-test$/);
    /*
      The intro says four things and no more.

      It used to open with the methodology — no hints, answers not shown,
      nothing here changes your lessons, not an official proficiency grade —
      which is four disclaimers to read before a beginner is allowed to find out
      how much Korean they know. What is left is what somebody standing at a bus
      stop needs: what this is, how long it takes, that "I don't know" is fine,
      and what the result is used for.

      The promises the disclaimers made are still kept; they are simply not
      recited. That no hint and no answer appears is asserted below, against the
      DOM, which is stronger than a sentence claiming it.
    */
    await expect(page.getByText(/Check your vocabulary level/i)).toBeVisible();
    await expect(page.getByText(/30 questions · 8 minutes/i)).toBeVisible();
    await expect(page.getByText(/Tapping “I don't know” is fine/i)).toBeVisible();
    await expect(page.getByText(/Your result sets the difficulty of your words/i)).toBeVisible();

    await page.getByTestId('level-start').click();

    // The bank arrives and a question is asked.
    await expect(page.getByTestId('level-unknown')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('group', { name: /Answers/i })).toBeVisible();
    const options = page.getByRole('group', { name: /Answers/i }).getByRole('button');
    await expect(options).toHaveCount(4);

    // Nothing on the question screen tells the learner how they are doing.
    const body = (await page.locator('body').innerText()).toLowerCase();
    expect(body).not.toMatch(/correct|incorrect|wrong|score|\d+\s*\/\s*\d+\s*right/);

    /*
      One clock for the whole test, not one per question.

      On screen it is four characters — 7:52 — which on their own could be
      anything, so the label lives in `aria-label` and the digits are what is
      drawn. Found by role and name rather than by text for exactly that reason:
      a text query for "Time left" finds nothing and says the timer is missing.
    */
    await expect(page.getByLabel(/Time left/i)).toBeVisible();

    const asked = await takeIt(page);
    /*
      Exactly thirty, every time.

      This used to assert a range of 18 to 36, because the test stopped when the
      estimator's standard error fell below a threshold. A length that depends
      on how you are doing tells you how you are doing while you sit it, and is
      not a thing a learner can plan around. The difficulty still adapts.
    */
    expect(asked).toBe(30);

    await expect(page.getByTestId('level-result')).toBeVisible();
    await expect(page.getByTestId('level-result')).toHaveText(/^1of 30$/);
    // Our own scale, named as ours on the screen that reports it.
    await expect(page.getByText('Hangyul Vocabulary Level', { exact: true })).toBeVisible();

    // Written down, and still there on the next launch.
    await page.reload();
    await waitForLaunch(page);
    await expect(page.getByText(/Last time you came out at Level 1\./i)).toBeVisible();
    await page.goto('/me');
    await waitForLaunch(page);
    // My page shows the level and the band it falls in — `levelTest:row.taken`.
    await expect(page.getByText(/Level 1 · STARTER/i)).toBeVisible();
  });

  test('leaves the learning progress alone', async ({ page }) => {
    /** Every store except settings, and how many rows each holds. */
    const counts = () =>
      page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const open = indexedDB.open('hangyul-ganada');
          open.onsuccess = () => resolve(open.result);
          open.onerror = () => reject(open.error);
        });
        const out: Record<string, number> = {};
        for (const name of [...db.objectStoreNames].filter((n) => n !== 'settings')) {
          out[name] = await new Promise<number>((resolve) => {
            const request = db.transaction(name).objectStore(name).count();
            request.onsuccess = () => resolve(request.result);
          });
        }
        return out;
      });

    await page.goto('/me/level-test');
    await waitForLaunch(page);
    // Taken *after* the launch, because opening the app writes a schema row and
    // a first session of its own. What is being asserted is that the test
    // changes nothing, not that the app has never written anything.
    const before = await counts();
    expect(Object.keys(before).length).toBeGreaterThan(0);

    await page.getByTestId('level-start').click();
    await expect(page.getByTestId('level-unknown')).toBeVisible({ timeout: 20_000 });
    await takeIt(page);
    await expect(page.getByTestId('level-result')).toBeVisible();

    // No progress row, no review memory, no session, no streak day.
    expect(await counts()).toEqual(before);
  });
});
