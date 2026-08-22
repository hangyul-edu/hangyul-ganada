import { expect, test } from '@playwright/test';

import { openTodaysWords } from './helpers/launch';

/**
 * A question in the learner's language, answered in the learner's language.
 *
 * ## The defect this exists to stop coming back
 *
 * A learner set the interface to Tamil, opened today's vocabulary, and was
 * asked "இந்தச் சொல்லின் பொருள் என்ன?" above four choices reading *a pocket, a
 * pouch* / *a car* / *grandmother* / *mother*. The question was in their
 * language and the answers were not, and nothing in the suite noticed, because
 * every check looked at translation *files* — which were complete — rather than
 * at the words a learner is actually shown.
 *
 * So this reads the options off the rendered screen and asserts on their
 * script. Latin letters in a Tamil, Telugu, Bengali or Arabic session are the
 * signature of English leaking through a fallback, and no correct option in
 * those languages is written in Latin.
 *
 * ## Why the script and not the strings
 *
 * Comparing against expected translations would make this a second copy of the
 * corpus, stale within a week. Script membership is the property that actually
 * matters — *is this readable by the person who chose this language* — and it
 * needs no fixture.
 *
 * Korean options are expected and fine: a `produce` question shows the meaning
 * as the prompt and four Korean words to choose between. What must never appear
 * is English.
 */

/** Locales with a non-Latin script, where Latin text is unambiguous evidence. */
const NON_LATIN = ['ta', 'te', 'bn', 'ar', 'hi', 'ru'] as const;

/** Three or more Latin letters in a row. Not tripped by a stray romanisation. */
const LATIN_WORD = /[A-Za-z]{3}/;

for (const locale of NON_LATIN) {
  test(`a ${locale} session never offers an English answer`, async ({ page }) => {
    await page.addInitScript((code) => {
      window.localStorage.setItem('hangyul_ganada:locale', code);
    }, locale);
    await openTodaysWords(page);

    /*
      Walk a few questions rather than one.

      The first screen of a sitting is an introduction card, and the exercise
      types are interleaved — so a single look might land on a `produce`
      question, whose options are Korean, and prove nothing about the `meaning`
      questions where the leak was.
    */
    const collected: string[][] = [];
    for (let step = 0; step < 18 && collected.length < 2; step += 1) {
      const options = page.getByRole('group').first();
      const choices = (await options.count())
        ? options.getByRole('button')
        : null;
      const labels = choices
        ? (await choices.allInnerTexts().catch(() => [])).map((t) => t.trim()).filter(Boolean)
        : [];

      if (labels.length >= 3) {
        collected.push(labels);
        /*
          Answer it, rather than pressing whatever is last on the screen.

          The first version clicked the last visible button in `main` to move
          on, which works while that button is *Continue* and stalls the moment
          it is something else — it hung for a minute in Hindi and passed
          everywhere else, which is the signature of a walk that depends on
          layout rather than on meaning.
        */
        await choices!.first().click().catch(() => {});
        await page.waitForTimeout(400);
      }

      const onward = page
        .locator('main button:visible:not([disabled])')
        .filter({ hasNotText: /^\s*$/ })
        .last();
      if (!(await onward.count())) break;
      await onward.click().catch(() => {});
      await page.waitForTimeout(500);
    }

    expect(collected.length, `no question appeared in ${locale}`).toBeGreaterThan(0);
    const english = collected.flat().filter((label) => LATIN_WORD.test(label));
    expect(english, `English answer choices in a ${locale} session`).toEqual([]);
  });
}
