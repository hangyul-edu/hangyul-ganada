import { expect, test, type Page } from '@playwright/test';

import { openTodaysWords } from './helpers/launch';

/**
 * Show answer, in the real daily session.
 *
 * The unit suite proves the component reports `revealed` and the domain
 * proves a revealed word is owed again; this proves what a learner sees:
 * the day's counter does not move on a reveal, the session moves on rather
 * than ending, and the app never says the answer in a sentence.
 */
async function firstQuestionWithAnswerRung(page: Page) {
  await openTodaysWords(page);
  const forward = page.getByRole('button', { name: /^(got it|next|continue)$/i }).first();
  for (let step = 0; step < 40; step += 1) {
    const hint = page.getByRole('button', { name: /show a hint|show the answer/i }).first();
    if (await hint.isVisible().catch(() => false)) return;
    if (await forward.isVisible().catch(() => false)) {
      await forward.click();
      continue;
    }
    await page.waitForTimeout(120);
  }
  throw new Error('no question offering help was reached');
}

const counter = async (page: Page) =>
  (await page.locator('header').getByText(/\d+\s*\/\s*\d+/).first().textContent())?.trim() ?? '';

test('revealing the answer does not move the day’s counter and does not end the session', async ({ page }) => {
  test.slow();
  await firstQuestionWithAnswerRung(page);
  const before = await counter(page);

  // Up the ladder to the last rung.
  for (let rung = 0; rung < 4; rung += 1) {
    const more = page.getByRole('button', { name: /show a hint|show the answer/i }).first();
    if (!(await more.count())) break;
    const label = ((await more.textContent()) ?? '').toLowerCase();
    await more.click();
    if (label.includes('answer')) break;
  }

  await expect(page.getByTestId('revealed-next')).toBeVisible();
  const body = await page.locator('body').innerText();
  expect(body).not.toMatch(/the answer is/i);
  expect(body).not.toMatch(/정답은/);
  expect(await counter(page)).toBe(before);

  await page.getByTestId('revealed-next').click();
  // Moved on: a new card is on screen and the counter still has not moved.
  await expect(page.getByTestId('revealed-next')).toHaveCount(0);
  await page.waitForTimeout(300);
  expect(await counter(page)).toBe(before);
  await expect(page.getByRole('button', { name: /^(got it|next|continue)$/i }).or(page.locator('[role=group] button')).first()).toBeVisible();
});
