import { test } from '@playwright/test';
import { waitForLaunch } from './helpers/launch';
const OUT = '/tmp/claude-0/-root-hangyul-ganada/e15b4fe1-368f-42d0-b07d-f22a3b0d6568/scratchpad/w';

test('the ㅘ lesson, guide and demonstration', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/letters/lesson-vowels-w');
  await waitForLaunch(page);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/00-intro.png`, fullPage: true });
  for (let i = 0; i < 6; i += 1) {
    const b = page.getByRole('button', { name: /Got it|let's start|Next|Continue|Trace it|Write it/i }).first();
    if (!(await b.count())) break;
    await b.click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/0${i + 1}.png`, fullPage: true });
  }
});
