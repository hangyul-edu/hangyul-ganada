import { openTodaysWords } from './helpers/launch';
import { expect, test, type Page } from '@playwright/test';

/**
 * The help a stuck learner is offered, in a real browser.
 *
 * ## What this catches that the unit tests do not
 *
 * `features/review/hints.test.ts` proves the ladder never contains the answer,
 * in all ten languages, over the whole corpus. It is the stronger test of the
 * two and it would have caught the original defect years earlier.
 *
 * It could not have caught the *second* defect, which shipped in the same hour.
 * The hint copy is assembled from translation keys — a part of speech, a
 * category — and the page has to resolve those keys before it renders them.
 * Nothing did. Every hint was correct, safe, and rendered as
 *
 *     It's a vocabulary:partOfSpeech.verb — something in vocabulary:categories.actions.
 *
 * A unit test on `wordHints` sees the key names and is happy, because key names
 * are what that function returns. Only a browser sees the sentence. So this
 * asks the browser.
 */

/**
 * Opens today's words and steps forward until a question with help appears.
 *
 * The session is a sequence of cards that replace each other, so between a tap
 * and the next card there is a frame with neither the button that was just
 * pressed nor the one about to appear. A loop that treats "no forward button"
 * as "the session is over" walks straight into it and reports that no question
 * offers a hint while sitting on the introduction card — which is what the
 * first version of this did, intermittently, depending on how fast the machine
 * was.
 */
async function firstQuestionWithHelp(page: Page) {
  await openTodaysWords(page);
  const hint = page.getByRole('button', { name: /show a hint/i });
  const forward = page.getByRole('button', { name: /^(got it|next|continue)$/i }).first();

  for (let step = 0; step < 40; step += 1) {
    if (await hint.isVisible().catch(() => false)) return hint;
    if (await forward.isVisible().catch(() => false)) {
      await forward.click();
      continue;
    }
    // Mid-transition. Give the next card a frame to arrive rather than
    // concluding there is nothing left.
    await page.waitForTimeout(120);
  }
  throw new Error('no question offering a hint was reached');
}

test('a hint reads as a sentence, not as a translation key', async ({ page }) => {
  const hint = await firstQuestionWithHelp(page);
  await hint.click();

  /*
   * The whole screen, because the failure was not in the hint's own element —
   * it was that a key reached the page at all. Anywhere is a bug.
   */
  const body = await page.locator('body').innerText();
  expect(body).not.toMatch(/vocabulary:|learning:|common:|settings:/);
  expect(body).not.toMatch(/partOfSpeech\.|categories\.|letterGroup\./);
});

test('the first hint does not contain the answer, and the last one does', async ({ page }) => {
  const hint = await firstQuestionWithHelp(page);

  // The four options, before anything is revealed.
  const options = page.locator('[role=group] button');
  await expect(options).toHaveCount(4);
  const answers = (await options.allInnerTexts()).map((text) => text.trim().toLowerCase());

  /*
   * What a light hint may not do is *add* a copy of an option to the page.
   *
   * The first version of this counted instead: at most one occurrence of each
   * option, since each is on screen once in its own button. That is the right
   * rule stated the wrong way, and it eventually reported a question that was
   * perfectly correct — 여기, offered against *there*, *over there*, *here* and
   * *I, me*. "there" occurs twice on that page and both are buttons, because
   * one option is a substring of another. Nothing had leaked.
   *
   * So the measurement is the difference the hint makes. The page is read
   * before and after, and no option may occur more often afterwards. That is
   * exactly the sentence the test is named for, it cannot be fooled by one
   * option containing another, and it is stricter than the count was: a hint
   * that repeated an option already on screen twice would now be caught.
   */
  const before = (await page.locator('body').innerText()).toLowerCase();
  await hint.click();
  const afterFirst = (await page.locator('body').innerText()).toLowerCase();
  const occurrencesOf = (text: string, needle: string) => text.split(needle).length - 1;
  for (const answer of answers) {
    if (answer.length < 3) continue;
    const added = occurrencesOf(afterFirst, answer) - occurrencesOf(before, answer);
    expect(added, `the hint added ${added} more copies of “${answer}”`).toBe(0);
  }

  // Press through to the reveal. The label changes when the next press gives up
  // the answer, which is the whole contract of the ladder.
  for (let rung = 0; rung < 3; rung += 1) {
    const more = page.getByRole('button', { name: /another hint|show the answer/i });
    if (!(await more.count())) break;
    const label = ((await more.textContent()) ?? '').toLowerCase();
    await more.click();
    if (label.includes('answer')) break;
  }

  const afterReveal = (await page.locator('body').innerText()).toLowerCase();
  expect(
    answers.some((answer) => answer.length >= 3 && afterReveal.split(answer).length - 1 >= 2),
  ).toBe(true);
});

test('a learner can read the whole app in Thai', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'th-TH', timezoneId: 'Asia/Bangkok' });
  const page = await context.newPage();

  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'th');

  /*
   * The lesson heading, specifically.
   *
   * Lesson titles are curriculum data rather than translation bundles, so they
   * were invisible to `i18n:check` and were English in every language except
   * Korean — on the home screen, in the largest type on it. A coverage report
   * saying 100% was true about the thing it measured.
   */
  const heading = page.getByRole('heading', { level: 2 }).first();
  await expect(heading).toContainText(/[฀-๿]/);

  for (const path of ['/letters', '/words', '/review', '/me']) {
    await page.goto(path);
    // `toContainText` and not `innerText()`: the route chunk and the locale
    // bundle are both dynamic imports, so a bare read can land on an empty
    // `<main>` that is about to be filled and report it as an untranslated
    // screen.
    await expect(page.locator('main'), `${path} has Thai on it`).toContainText(/[฀-๿]/);
  }

  await context.close();
});

test('a learner can read the whole app in Vietnamese', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh' });
  const page = await context.newPage();

  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');

  /*
   * Vietnamese is Latin script, so "is it translated" cannot be answered by
   * looking for a different alphabet. It is answered by the diacritics, which
   * are the thing that breaks when a font or a normalisation step is wrong —
   * and by the absence of the English strings that would be there if the bundle
   * had not loaded.
   */
  await expect(page.locator('body')).toContainText(/[ăâđêôơưàáảãạèéẻẽẹìíỉĩịòóỏõọùúủũụỳýỷỹỵ]/i);
  await expect(page.locator('body')).not.toContainText('Learn Hangul, one stroke at a time.');

  await context.close();
});
