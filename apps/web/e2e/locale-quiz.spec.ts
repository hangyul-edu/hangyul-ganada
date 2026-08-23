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

/**
 * Locales with a non-Latin script, and the script an answer in them is written
 * in.
 *
 * The range is what makes the walk cheap. It used to collect two question
 * screens and stop, on the reasoning that one look might land on a `produce`
 * question whose options are Korean and prove nothing — true, but "two screens"
 * is a proxy for "a screen with a real answer on it", and the proxy is what
 * made the test expensive: §22–§32 requeue a word answered wrongly, this clicks
 * the first option every time, and the number of screens before the second
 * question runs from four to fourteen. Asking the direct question instead —
 * *have I seen an option written in this learner's script?* — usually finishes
 * in three or four.
 */
const NON_LATIN = {
  ta: /[\u0B80-\u0BFF]/,
  te: /[\u0C00-\u0C7F]/,
  bn: /[\u0980-\u09FF]/,
  ar: /[\u0600-\u06FF]/,
  hi: /[\u0900-\u097F]/,
  ru: /[\u0400-\u04FF]/,
} as const;

/** Three or more Latin letters in a row. Not tripped by a stray romanisation. */
const LATIN_WORD = /[A-Za-z]{3}/;

for (const [locale, script] of Object.entries(NON_LATIN)) {
  test(`a ${locale} session never offers an English answer`, async ({ page }) => {
    /*
      Declared slow, because it is.

      This drives a real sitting through up to ten screens — each one a route
      change, a corpus band and a locale pack — and it does that six times per
      project. Run on an idle machine each case takes about eighteen seconds
      against a sixty-second cap, which is comfortable; run twenty in a row on
      a loaded one it is not, and the failures wander between locales, which is
      the signature of a clock rather than a defect. `test.slow()` says that
      out loud instead of leaving a suite that fails somewhere different each
      time.
    */
    test.slow();
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
    /*
      Stop as soon as there is nothing more to learn from walking further.

      Two things end the walk: an option written in the learner's own script,
      which is positive proof the meaning came from their pack, or two question
      screens, which is the older and weaker evidence. Whichever arrives first.

      Only the *stopping* is opportunistic. Script evidence cannot be required,
      and requiring it was a mistake worth recording: three of the six locales
      failed on desktop and passed on mobile, because which exercise a sitting
      offers first is a property of the rotation — `produce`, `context` and
      `build` all show Korean options, quite correctly — and not of anything
      this test is about.

      Fourteen steps is the cap, and it is a *budget* rather than a target: a
      question is usually two or three screens in, and occasionally the plan
      puts several introductions first. It used to be sixteen and it used to
      cost ten seconds a step, because the walk was wandering into the level
      test — see `openTodaysWords`. With that fixed a step is under a second
      and the cap is cheap insurance rather than the thing that decides
      whether the run finishes.
    */
    const collected: string[][] = [];
    const inTheirScript = () => collected.flat().some((label) => script.test(label));
    for (let step = 0; step < 14 && !inTheirScript() && collected.length < 2; step += 1) {
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
        await choices!.first().click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(250);
      }

      const onward = page
        .locator('main button:visible:not([disabled])')
        .filter({ hasNotText: /^\s*$/ })
        .last();
      if (!(await onward.count())) break;
      /*
        A two-second budget per click, because this walk is opportunistic.

        Both clicks are already written as "try it and carry on" — the
        `.catch()` says so — but a bare `click()` carries Playwright's default
        30-second actionability timeout, and it *waits out the whole thing*
        before the catch runs. One covered button therefore costs half a minute,
        and fourteen steps of that is 420 seconds against a 180-second test.
        That is what a locale-quiz failure has looked like every time it has
        happened: a different language each run, three minutes long, with no
        assertion in the trace. A walk that tolerates a failed click has to
        tolerate it *quickly*.
      */
      await onward.click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(300);
    }

    expect(collected.length, `no question appeared in ${locale}`).toBeGreaterThan(0);
    const english = collected.flat().filter((label) => LATIN_WORD.test(label));
    expect(english, `English answer choices in a ${locale} session`).toEqual([]);
  });
}
