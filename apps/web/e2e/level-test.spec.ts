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

/** Answers "I don't know" until the result appears, and returns the count. */
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
    await expect(page.getByText(/No hints, and the answers are not shown/i)).toBeVisible();
    await expect(page.getByText(/Nothing here changes your lessons/i)).toBeVisible();
    await expect(page.getByText(/not an official proficiency grade/i)).toBeVisible();

    await page.getByTestId('level-start').click();

    // The bank arrives and a question is asked.
    await expect(page.getByTestId('level-unknown')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('group', { name: /Answers/i })).toBeVisible();
    const options = page.getByRole('group', { name: /Answers/i }).getByRole('button');
    await expect(options).toHaveCount(4);

    // Nothing on the question screen tells the learner how they are doing.
    const body = (await page.locator('body').innerText()).toLowerCase();
    expect(body).not.toMatch(/correct|incorrect|wrong|score|\d+\s*\/\s*\d+\s*right/);

    const asked = await takeIt(page);
    // The engine's own floor and ceiling, met through the interface.
    expect(asked).toBeGreaterThanOrEqual(18);
    expect(asked).toBeLessThanOrEqual(36);

    await expect(page.getByTestId('level-result')).toBeVisible();
    await expect(page.getByTestId('level-result')).toHaveText(/^1of 30$/);
    await expect(page.getByText('Hangyul Vocabulary Level', { exact: true })).toBeVisible();
    await expect(page.getByText(/not an official proficiency grade/i)).toBeVisible();

    // Written down, and still there on the next launch.
    await page.reload();
    await waitForLaunch(page);
    await expect(page.getByText(/You last came out at Level 1\./i)).toBeVisible();
    await page.goto('/me');
    await waitForLaunch(page);
    await expect(page.getByText(/Your last result: Level 1/i)).toBeVisible();
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
