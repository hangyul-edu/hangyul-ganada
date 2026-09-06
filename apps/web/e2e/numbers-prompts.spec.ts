import { expect, test, type Page } from '@playwright/test';

import { NUMBER_LESSONS, getNumberItem } from '../src/data/numbers';
import {
  MEANING_PROMPT_KEY,
  practiceExercises,
  type NumbersExercise,
} from '../src/features/numbers/exercises';
import { copy } from './helpers/copy';
import { openApp } from './helpers/launch';

/**
 * The instruction over a Numbers question says what the question wants.
 *
 * ## The two screenshots
 *
 * Four buttons — 세 시 · 두 개 · 한 명 · 셋 시 — under **어느 쪽이 맞을까요?**,
 * *which one is right?*. Three of them are right; the answer the grader wanted
 * was 셋 시, the one that is wrong. A learner who read the instruction and
 * obeyed it was marked incorrect.
 *
 * And 한 개, under **이건 무슨 뜻일까요?**, *what does this mean?*, with four
 * whole grammar rules to choose between. 한 개 does not mean *counting words
 * take a space*; that question is *which of these statements is true*, and it
 * was wearing the meaning question's instruction because the two are built by
 * the same function.
 *
 * ## What is asserted here rather than in the unit tests
 *
 * `features/numbers/questionTypes.test.ts` holds the data side: which type each
 * builder produces, and which sentence each type resolves to in each bundle.
 * What it cannot see is the page — that the switch in `NumberSessionPage` has a
 * branch for the type, that the branch reaches the right key, and that the
 * heading, the options, the feedback and the Continue button are all on screen
 * together on a 320-wide phone with a long translation in them.
 */

const PITFALLS = '/letters/numbers/num-lesson-pitfalls';
const FORMS = '/letters/numbers/num-lesson-forms';
const SINO = '/letters/numbers/num-lesson-sino-basics';
const ORDINALS = '/letters/numbers/num-lesson-ordinals';

const en = (path: string) => copy('numbers', path);

const optionLabel = (exercise: NumbersExercise, index: number): string => {
  const option = exercise.options[index]!;
  if (option.isKey) return en(option.text);
  if (option.value !== undefined) return new Intl.NumberFormat('en').format(option.value);
  return option.text;
};

/** Objective, every explanation step, every example, then guided practice. */
async function intoPractice(page: Page, route: string, lessonId: string) {
  const lesson = NUMBER_LESSONS.find((l) => l.id === lessonId)!;
  await openApp(page, route);
  await page.getByRole('button', { name: en('action.start') }).click();
  for (let i = 0; i < lesson.explanation.length; i += 1) {
    await page.getByRole('button', { name: en('action.next') }).click();
  }
  for (let i = 0; i < lesson.item_ids.length; i += 1) {
    await page.getByRole('button', { name: en('action.next') }).click();
  }
  await page.getByTestId('numbers-phase-practice-intro').waitFor();
  await page.getByRole('button', { name: en('action.beginPractice') }).click();
  return practiceExercises(lesson, 0);
}

/**
 * Steps through the run until a question of `type` is on screen, answering the
 * ones before it correctly. Returns the exercise, or null if the run has none.
 */
async function reach(
  page: Page,
  exercises: NumbersExercise[],
  type: NumbersExercise['question_type'],
): Promise<NumbersExercise | null> {
  const body = page.getByTestId('numbers-phase-practice');
  for (const exercise of exercises) {
    await expect(body).toHaveAttribute('data-question-type', exercise.question_type);
    if (exercise.question_type === type) return exercise;
    if (exercise.kind === 'order_parts') {
      for (const part of exercise.parts!) {
        await body
          .locator('button[lang="ko"]:not([disabled])')
          .filter({ hasText: new RegExp(`^${part}$`) })
          .first()
          .click();
      }
    } else {
      await body
        .getByRole('group')
        .getByRole('button', { name: optionLabel(exercise, exercise.answer), exact: true })
        .click();
    }
    await page.getByRole('button', { name: en('action.continue') }).click();
  }
  return null;
}

test.describe('a listening question can be answered without the clip', () => {
  /*
   * The accommodation, on the page rather than in the data.
   *
   * `numbers:qa` §11 proves that every substitute identifies exactly one option
   * and that the run-level `soundFree` route leaves a completable course. What
   * it cannot see is the page: that the button is drawn under a listening
   * question and nowhere else, that pressing it replaces the prompt rather than
   * adding to it, and — the part that makes it an accommodation instead of a
   * skip — that the same answer is still accepted and still recorded.
   */
  test('Can’t use audio? swaps the clip for a question with the same answer', async ({ page }) => {
    const exercises = await intoPractice(page, SINO, 'num-lesson-sino-basics');
    const exercise = await reach(page, exercises, 'listenAndChoose');
    expect(exercise, 'the first lesson builds no listening question').not.toBeNull();
    expect(exercise!.soundFree, 'that listening question has no visual substitute').toBeTruthy();

    const body = page.getByTestId('numbers-phase-practice');
    const escape = page.getByTestId('numbers-sound-free');
    await expect(escape).toBeVisible();
    // Before it is pressed the prompt is the clip and nothing else.
    await expect(page.getByTestId('numbers-prompt-visual')).toHaveCount(0);

    await escape.click();

    // The instruction changed, the substitute is on screen, and the way out is
    // gone — it is one-way on purpose, so it is not a toggle to decide about.
    await expect(page.getByTestId('numbers-prompt')).toContainText(
      en(exercise!.soundFree!.promptKey),
    );
    await expect(page.getByTestId('numbers-prompt')).not.toContainText(en('prompt.listenAndChoose'));
    await expect(page.getByTestId('numbers-prompt-visual')).toBeVisible();
    await expect(escape).toHaveCount(0);

    // Same options, same answer, same scoring.
    const answer = optionLabel(exercise!, exercise!.answer);
    await body.getByRole('group').getByRole('button', { name: answer, exact: true }).click();
    await expect(body.getByRole('status')).toContainText(en('feedback.correct'));
  });

  test('the button is not offered on a question that is not a clip', async ({ page }) => {
    const exercises = await intoPractice(page, SINO, 'num-lesson-sino-basics');
    const exercise = await reach(page, exercises, 'writeTheDigits');
    expect(exercise, 'the first lesson builds no write-the-digits question').not.toBeNull();
    await expect(page.getByTestId('numbers-sound-free')).toHaveCount(0);
  });
});

test.describe('the instruction matches the question', () => {
  test('a find-the-mistake question says so, and its answer is the wrong expression', async ({ page }) => {
    const exercises = await intoPractice(page, FORMS, 'num-lesson-forms');
    const exercise = await reach(page, exercises, 'findIncorrectExpression');
    expect(exercise, 'the counting-form lesson builds no spot-the-mistake question').not.toBeNull();

    const body = page.getByTestId('numbers-phase-practice');
    await expect(page.getByTestId('numbers-prompt')).toContainText(en('prompt.findIncorrectExpression'));
    // And not the instruction that asked the opposite thing.
    await expect(page.getByTestId('numbers-prompt')).not.toContainText('어느 쪽이 맞을까요');

    /*
     * The screenshot's own question, end to end: tap the option the data says
     * is the answer, and the app agrees it was right. That is the pairing that
     * was broken — the instruction said *find the right one* and the grader
     * accepted the wrong one — so asserting the instruction alone would not
     * catch it coming back the other way round.
     */
    const answer = optionLabel(exercise!, exercise!.answer);
    await body.getByRole('group').getByRole('button', { name: answer, exact: true }).click();
    await expect(body.getByRole('status')).toContainText(en('feedback.correct'));
  });

  test('an explanation question asks for the correct explanation, over the contrast pair', async ({ page }) => {
    const exercises = await intoPractice(page, PITFALLS, 'num-lesson-pitfalls');
    const exercise = await reach(page, exercises, 'chooseCorrectExplanation');
    expect(exercise, 'the review lesson builds no explanation question').not.toBeNull();

    const prompt = page.getByTestId('numbers-phase-practice');
    await expect(prompt).toContainText(en('prompt.chooseCorrectExplanation'));
    /*
     * And not a *meaning* instruction. `prompt.chooseMeaning` is retired — there
     * are five now, one per domain a meaning question can ask about — so the
     * one to keep off this screen is the one an explanation question would
     * otherwise be confused with: 이 말은 무엇을 나타낼까요?
     */
    await expect(prompt).not.toContainText(en('prompt.meaning.definition'));

    // The stimulus is the ✓/✗ pair, which is what makes exactly one rule apply.
    const item = getNumberItem(exercise!.item_id)!;
    if (item.example) await expect(prompt).toContainText(item.example);

    const answer = optionLabel(exercise!, exercise!.answer);
    await page
      .getByTestId('numbers-phase-practice')
      .getByRole('group')
      .getByRole('button', { name: answer, exact: true })
      .click();
    await expect(page.getByTestId('numbers-phase-practice').getByRole('status')).toContainText(
      en('feedback.correct'),
    );
  });

  test('a listening question and a meaning question keep their own instructions', async ({ page }) => {
    const exercises = await intoPractice(page, SINO, 'num-lesson-sino-basics');
    /*
     * `chooseMeaning` is not on this list any more, and its absence is the
     * point: a numeral's meaning *is* its value, so asking for it is
     * `writeTheDigits`. The sino-basics lesson builds no meaning question at
     * all, and a test that waited for one here would wait for ever.
     */
    const wanted: NumbersExercise['question_type'][] = ['listenAndChoose', 'writeTheDigits'];
    const body = page.getByTestId('numbers-phase-practice');
    const seen = new Set<string>();
    for (const exercise of exercises) {
      await expect(body).toHaveAttribute('data-question-type', exercise.question_type);
      if (wanted.includes(exercise.question_type)) {
        const key =
          exercise.question_type === 'listenAndChoose'
            ? 'prompt.listenAndChoose'
            : exercise.question_type === 'chooseMeaning'
              ? // Five instructions, chosen by what the answer is.
                MEANING_PROMPT_KEY[exercise.schema.answerDomain]!
              : 'prompt.koreanToDigits';
        await expect(page.getByTestId('numbers-prompt')).toContainText(en(key));
        seen.add(exercise.question_type);
      }
      await body
        .getByRole('group')
        .getByRole('button', { name: optionLabel(exercise, exercise.answer), exact: true })
        .click();
      await page.getByRole('button', { name: en('action.continue') }).click();
      if (seen.size === wanted.length) break;
    }
    expect([...seen].sort()).toEqual([...wanted].sort());
  });
});

test.describe('an example says whether it is about writing or about sound', () => {
  test('heads the June and October cards with the pronunciation label', async ({ page }) => {
    await openApp(page, '/letters/numbers/num-lesson-dates');
    await page.getByRole('button', { name: en('action.start') }).click();
    const lesson = NUMBER_LESSONS.find((l) => l.id === 'num-lesson-dates')!;
    for (let i = 0; i < lesson.explanation.length; i += 1) {
      await page.getByRole('button', { name: en('action.next') }).click();
    }
    const pronunciation = en('exampleLabel.pronunciation');
    const writing = en('exampleLabel.writing');
    for (const id of lesson.item_ids) {
      const item = getNumberItem(id)!;
      const card = page.getByTestId('numbers-example-card');
      await expect(card).toContainText(item.korean);
      if (item.example_kind === 'pronunciation') {
        await expect(card).toContainText(pronunciation);
        await expect(card).not.toContainText(writing);
        // And the corrected spacing, on the card the learner reads.
        await expect(card).toContainText(item.example!);
      }
      await page.getByRole('button', { name: en('action.next') }).click();
    }
  });
});

test.describe('the ordinal lesson, in a browser', () => {
  /**
   * The one question in the course whose answer is a form the product spends
   * four sections of `numbers:qa` keeping out of everything else.
   *
   * `한 번째` may not be an item, a clip, a gloss or an accepted answer — and it
   * has to be on this screen, as the option a learner is asked to identify,
   * under an instruction that says *find the wrong one*. A gate can say the
   * data is right; only the page can say the learner is being asked for the
   * thing the grader accepts.
   */
  test('asks for the wrong ordinal by name, and marks 한 번째 correct', async ({ page }) => {
    const exercises = await intoPractice(page, ORDINALS, 'num-lesson-ordinals');
    const exercise = await reach(page, exercises, 'findIncorrectExpression');
    expect(exercise, 'the ordinal lesson built no find-the-mistake question').not.toBeNull();
    const body = page.getByTestId('numbers-phase-practice');
    await expect(page.getByTestId('numbers-prompt')).toHaveText(en('prompt.findIncorrectExpression'));
    const answer = exercise!.options[exercise!.answer]!.text;
    expect(['한 번째', '이 번째', '세번째', '넷 번째']).toContain(answer);
    await body.getByRole('group').getByRole('button', { name: answer, exact: true }).click();
    await expect(body.getByRole('status')).toContainText(en('feedback.correct'));
  });

  test('heads the position question with 몇 번째 rather than the counting one', async ({ page }) => {
    const exercises = await intoPractice(page, ORDINALS, 'num-lesson-ordinals');
    const exercise = await reach(page, exercises, 'chooseMeaning');
    expect(exercise, 'the ordinal lesson built no meaning question').not.toBeNull();
    const domain = exercise!.schema.answerDomain;
    expect(['ordinalPosition', 'ordinalRank']).toContain(domain);
    await expect(page.getByTestId('numbers-prompt')).toHaveText(en(MEANING_PROMPT_KEY[domain]!));
  });

  test('keeps the four ordinal options on one 320-wide screen, at 200% text', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.addInitScript(() => {
      document.documentElement.style.fontSize = '32px';
    });
    const exercises = await intoPractice(page, ORDINALS, 'num-lesson-ordinals');
    const body = page.getByTestId('numbers-phase-practice');
    const exercise = exercises[0]!;
    const options = body.getByRole('group').getByRole('button');
    await expect(options).toHaveCount(exercise.options.length);
    for (let i = 0; i < exercise.options.length; i += 1) {
      await options.nth(i).scrollIntoViewIfNeeded();
      const shape = await options.nth(i).boundingBox();
      expect(shape!.width, `option ${i} overflows 320px`).toBeLessThanOrEqual(320);
    }
    // Nothing scrolls sideways, whatever the text size.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, 'the page scrolls sideways').toBeLessThanOrEqual(1);
    await options.nth(exercise.answer).scrollIntoViewIfNeeded();
    await options.nth(exercise.answer).click();
    const next = page.getByRole('button', { name: en('action.continue') });
    await next.scrollIntoViewIfNeeded();
    await expect(next).toBeEnabled();
    await next.click();
    await expect(body).toBeVisible();
  });
});

test.describe('the question fits the phone', () => {
  /**
   * 320x568 is the smallest screen the product supports, and a long translation
   * is where a prompt, four options, a feedback box and a Continue button stop
   * fitting on it. The rule is not that everything is visible without scrolling
   * — it is that the learner can always *get to* the button that moves them on.
   */
  for (const [width, height, label] of [
    [320, 568, 'small Android'],
    [375, 667, 'iPhone SE'],
  ] as const) {
    test(`keeps the prompt, the options and Continue reachable at ${width}x${height} (${label})`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      const exercises = await intoPractice(page, PITFALLS, 'num-lesson-pitfalls');
      const body = page.getByTestId('numbers-phase-practice');
      const exercise = exercises[0]!;

      // The instruction is on screen and not clipped to nothing.
      const heading = page.getByTestId('numbers-prompt');
      await expect(heading).toBeVisible();
      const box = await heading.boundingBox();
      expect(box!.width, 'the prompt is wider than the viewport').toBeLessThanOrEqual(width);

      // Every option is reachable and readable.
      const options = body.getByRole('group').getByRole('button');
      await expect(options).toHaveCount(exercise.options.length);
      for (let i = 0; i < exercise.options.length; i += 1) {
        await options.nth(i).scrollIntoViewIfNeeded();
        await expect(options.nth(i)).toBeVisible();
        const shape = await options.nth(i).boundingBox();
        expect(shape!.width, `option ${i} overflows`).toBeLessThanOrEqual(width);
      }

      // Answer, then the feedback and the way on.
      await options.nth(exercise.answer).scrollIntoViewIfNeeded();
      await options.nth(exercise.answer).click();
      await expect(body.getByRole('status')).toBeVisible();
      const next = page.getByRole('button', { name: en('action.continue') });
      await next.scrollIntoViewIfNeeded();
      await expect(next).toBeVisible();
      await next.click();
    });
  }

  test('survives text scaled up, in the language with the longest instruction', async ({ page }) => {
    /*
     * German and Filipino write these instructions longest, and a learner who
     * has turned the system text size up is the case where a two-line prompt
     * becomes four. The button at the end still has to be reachable — by
     * scrolling, which is fine, but it has to exist and be clickable.
     */
    await page.setViewportSize({ width: 320, height: 568 });
    await page.addInitScript(() => {
      document.documentElement.style.fontSize = '22px';
    });
    const exercises = await intoPractice(page, PITFALLS, 'num-lesson-pitfalls');
    const body = page.getByTestId('numbers-phase-practice');
    const exercise = exercises[0]!;
    const options = body.getByRole('group').getByRole('button');
    await options.nth(exercise.answer).scrollIntoViewIfNeeded();
    await options.nth(exercise.answer).click();
    const next = page.getByRole('button', { name: en('action.continue') });
    await next.scrollIntoViewIfNeeded();
    await expect(next).toBeEnabled();
    await next.click();
    // And the run carries on rather than ending in a wall.
    await expect(body).toBeVisible();
  });
});
