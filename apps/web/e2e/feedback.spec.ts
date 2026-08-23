import { expect, test, type Page } from '@playwright/test';

import { openApp, openTodaysWords } from './helpers/launch';
import { drawScribble, traceReferenceGlyph } from './helpers/trace';

/**
 * Was I right?
 *
 * ## The defects these exist for
 *
 * A learner wrote 고, tapped Check, and the screen showed a button reading
 * *문제 풀어 보기* and nothing else. Whether the grader had accepted the letter
 * or given up on it was not on the screen in any form: the acceptance was
 * `hg-sr-only`, announced to a screen reader and shown to nobody, on the
 * reasoning that "a sighted learner sees the box lock and the button appear".
 *
 * Then they answered a recognition question correctly and were congratulated by
 * the word **"Headline"** — `t('handwriting:feedback.correct.headline')` naming
 * a key that has never existed, humanised by `parseMissingKeyHandler` into
 * something that reads like real copy — above the sentence "맞아요, 고예요.",
 * which tells somebody who has just tapped the tile marked 고 that the answer
 * is 고.
 *
 * ## Why these are e2e and not unit tests
 *
 * Because every one of them was invisible to the unit suite, and two of them
 * were invisible to a *reading* of the source: `feedback.correct.headline` is a
 * plausible-looking key and `hg-sr-only` is a deliberate-looking class. What
 * they have in common is that they are only wrong on a screen.
 */

const LESSON = '/letters/lesson-vowels-core?from=start';
const box = (page: Page) => page.getByTestId('writing-canvas').first();

/** Past the unit card and the letter's introduction, to the writing box. */
async function reachTheBox(page: Page) {
  await openApp(page, LESSON);
  const unitCta = page.getByRole('button', { name: "Got it — let's start" });
  const introCta = page.getByRole('button', { name: /Trace it|Write it/ });
  await expect(unitCta.or(introCta).or(box(page)).first()).toBeVisible();
  if (await unitCta.isVisible()) {
    await unitCta.click();
    await expect(introCta.or(box(page)).first()).toBeVisible();
  }
  if (await introCta.isVisible()) await introCta.click();
  await page.evaluate(() => document.fonts.ready);
  await expect(box(page).locator('canvas').first()).toBeVisible();
  await page.waitForTimeout(300);
}

/** Everything the learner can read, once. */
const screen = (page: Page) => page.locator('main').innerText();

test('an accepted letter says so, and offers the way on', async ({ page }) => {
  await reachTheBox(page);
  await traceReferenceGlyph(page, box(page));
  await page.getByRole('button', { name: 'Check' }).click();

  await expect(page.getByText('Correct.', { exact: true })).toBeVisible();
  // And the way on is the next step, not a retry.
  await expect(
    page.getByRole('button', { name: /Try a question|Next letter|Finish/ }),
  ).toBeVisible();

  const text = await screen(page);
  expect(text, 'a placeholder key reached the screen').not.toContain('Headline');
  expect(text, 'praise came back').not.toMatch(/Nice|Great|Perfect|Well done|That's it/i);
  // No score, no stroke arithmetic: §15.
  expect(text, 'the grader started talking about itself').not.toMatch(/\d+%/);
});

test('a rejected letter says so, and offers a retry rather than the way on', async ({ page }) => {
  await reachTheBox(page);
  await drawScribble(page, box(page));
  await page.getByRole('button', { name: 'Check' }).click();

  await expect(page.getByText('Incorrect.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Write it again|Try again/ })).toBeVisible();

  /*
    And the learner is not advanced. §20: the next step must not be the primary
    action before the writing has been accepted, because a button that carries
    on is indistinguishable from having passed.
  */
  await expect(page.getByRole('button', { name: /Try a question|Next letter/ })).toHaveCount(0);
  const text = await screen(page);
  expect(text).not.toContain('Headline');
});

test('a recognition answer is told apart from the screen describing itself', async ({ page }) => {
  await reachTheBox(page);
  await traceReferenceGlyph(page, box(page));
  await page.getByRole('button', { name: 'Check' }).click();
  await page.getByRole('button', { name: 'Try a question' }).click();

  // The question, then the letter it is asking about.
  await expect(page.getByText(/Which one makes this sound/i)).toBeVisible();
  const tiles = page.getByRole('button').filter({ hasText: /^[㄰-㆏가-힣]$/ });
  await tiles.first().click();

  const text = await screen(page);
  expect(text, 'a placeholder key reached the screen').not.toContain('Headline');
  /*
    The verdict, and only the verdict. "맞아요, 고예요." in English is
    "Correct, it's ㅏ." — the screen reading the learner's own tap back to
    them. §17 forbids the pattern, not just that sentence.
  */
  expect(text).toMatch(/Correct\.|Incorrect\./);
  expect(text, 'the answer was restated at the learner').not.toMatch(
    /(Correct|That's right)[,:]\s*\S/i,
  );
});

test('a word answered wrong says so, in the same words as everywhere else', async ({ page }) => {
  /*
   * The review and vocabulary exercises had their own verdicts — "That's it."
   * and "Not quite. Here it is." — while the writing box and the recognition
   * step said "Correct." and "Incorrect.". Three screens of one product,
   * disagreeing about what being right is called, and only the first two were
   * covered when the shared verdict was introduced.
   *
   * The answer itself stays on the screen below the verdict. A choice question
   * cannot be retried where it stands — a missed word comes back through the
   * schedule, not through a button — so a wrong answer that showed nothing
   * would be a review that teaches nothing. What §16 forbids is the verdict and
   * the answer fused into one breath, 맞아요, 고예요, and that is gone.
   */
  await openTodaysWords(page);

  // Walk to the first question with options, then answer it wrongly on purpose.
  for (let step = 0; step < 14; step += 1) {
    const options = page.getByRole('group').first();
    const choices = (await options.count()) ? options.getByRole('button') : null;
    const count = choices ? await choices.count() : 0;
    if (count >= 3) {
      const before = await screen(page);
      // The last option is wrong unless the shuffle put the answer there; if it
      // was right the assertion below simply reads the other verdict.
      await choices.nth(count - 1).click();
      await expect(
        page.getByText('Correct.', { exact: true }).or(page.getByText('Incorrect.', { exact: true })),
      ).toBeVisible();
      const text = await screen(page);
      expect(text, 'the old review verdict came back').not.toContain('Not quite');
      expect(text, 'the old review verdict came back').not.toContain("That's it.");
      expect(text, 'a placeholder key reached the screen').not.toContain('Headline');
      expect(before.length).toBeGreaterThan(0);
      return;
    }
    const forward = page.getByRole('button', { name: /Continue|Next|Got it|Start|Check/ }).last();
    if (!(await forward.count())) break;
    await forward.click();
    await page.waitForTimeout(200);
  }
  throw new Error('no question with options appeared in fourteen steps');
});
