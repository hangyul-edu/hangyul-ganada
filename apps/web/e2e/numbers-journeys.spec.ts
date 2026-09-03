import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

import { NUMBER_LESSONS, getNumberLesson, numberLessonItems } from '../src/data/numbers';
import { practiceExercises } from '../src/features/numbers/exercises';
import { openApp } from './helpers/launch';

/**
 * What a beginner can actually do after the course.
 *
 * ## Why this exists beside `numbers.spec.ts`
 *
 * That spec tests the machinery: that a lesson records evidence, that a
 * completion is derived rather than declared, that nothing is locked. It would
 * pass in full on a course that taught the wrong things — every one of its
 * assertions is about *shape*, and none is about whether a learner who finished
 * can read a price.
 *
 * These are the ten things the course exists to make possible, written as
 * situations rather than as data shapes. Each one names the lesson that answers
 * it and the Korean a learner must meet there; the test opens that lesson as a
 * new learner, walks its explanation and examples, and answers a real practice
 * question about the taught item correctly. A journey whose lesson stops
 * teaching its item fails here, whatever the item count says.
 *
 * The journeys are deliberately the ones a first week in Korea produces:
 * ordering two coffees, saying an age, reading a price tag, hearing a floor
 * number in a lift.
 */

const en = (() => {
  const bundle = JSON.parse(readFileSync(new URL('../src/locales/en/numbers.json', import.meta.url), 'utf8'));
  return (path: string) =>
    path.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], bundle) as string;
})();

/** situation → the lesson that answers it, and the Korean it must teach. */
const JOURNEYS = [
  { name: 'count three objects', lesson: 'num-lesson-native-basics', korean: ['하나', '둘', '셋'] },
  { name: 'ask for one or two of something', lesson: 'num-lesson-forms', korean: ['한', '두'] },
  { name: 'say a basic age', lesson: 'num-lesson-age', korean: ['살'] },
  { name: 'read a simple price', lesson: 'num-lesson-money', korean: ['원'] },
  { name: 'read a clock time in hours and minutes', lesson: 'num-lesson-minutes', korean: ['분'] },
  { name: 'read a date', lesson: 'num-lesson-dates', korean: ['월', '일'] },
  { name: 'recognise a floor number', lesson: 'num-lesson-digits', korean: ['층'] },
  { name: 'read a phone number digit by digit', lesson: 'num-lesson-digits', korean: ['공'] },
  { name: 'understand 0 as 영 or 공', lesson: 'num-lesson-zero', korean: ['영', '공'] },
  { name: 'understand a 만 원 price', lesson: 'num-lesson-large', korean: ['만'] },
] as const;

test.describe('what a beginner can do afterwards', () => {
  test('every journey has a lesson that teaches its Korean', () => {
    /*
     * Checked without a browser first, so a journey that lost its lesson fails
     * with the missing word named rather than as a timeout in the walk below.
     */
    for (const journey of JOURNEYS) {
      const lesson = getNumberLesson(journey.lesson);
      expect(lesson, `${journey.name}: no lesson ${journey.lesson}`).toBeTruthy();
      const taught = numberLessonItems(lesson!).flatMap((item) => [item.korean, ...(item.example ? [item.example] : [])]);
      for (const word of journey.korean) {
        expect(
          taught.some((text) => text.includes(word)),
          `${journey.name}: ${journey.lesson} never shows ${word}`,
        ).toBe(true);
      }
    }
  });

  for (const journey of JOURNEYS) {
    test(`a new learner can ${journey.name}`, async ({ page }) => {
      const lesson = getNumberLesson(journey.lesson)!;
      await openApp(page, `/letters/numbers/${lesson.id}`);

      // The objective, then every explanation step, then every example.
      await page.getByRole('button', { name: en('action.start') }).click();
      for (let i = 0; i < lesson.explanation.length; i += 1) {
        await expect(page.getByTestId('numbers-phase-explain')).toBeVisible();
        await page.getByRole('button', { name: en('action.next') }).click();
      }

      const shown: string[] = [];
      for (let i = 0; i < lesson.item_ids.length; i += 1) {
        const card = page.getByTestId('numbers-example-card');
        await expect(card).toBeVisible();
        shown.push(await card.innerText());
        await page.getByRole('button', { name: en('action.next') }).click();
      }
      for (const word of journey.korean) {
        expect(shown.join(' '), `${journey.name}: ${word} never appeared on screen`).toContain(word);
      }

      // One real practice question, answered correctly.
      const exercises = practiceExercises(lesson, 0);
      const first = exercises[0]!;
      await page.getByRole('button', { name: en('action.beginPractice') }).click();
      const body = page.getByTestId('numbers-phase-practice');
      if (first.kind === 'order_parts') {
        for (const part of first.parts!) {
          await body.locator('button[lang="ko"]:not([disabled])').filter({ hasText: new RegExp(`^${part}$`) }).first().click();
        }
      } else {
        const answer = first.options[first.answer]!;
        const label = answer.isKey
          ? en(answer.text)
          : answer.value !== undefined
            ? new Intl.NumberFormat('en').format(answer.value)
            : answer.text;
        await body.getByRole('group').getByRole('button', { name: label, exact: true }).click();
      }
      await expect(body.getByRole('status')).toContainText(en('feedback.correct'));
    });
  }

  test('the course still covers every journey after any lesson is renamed', () => {
    // A journey pointing at a lesson id that no longer exists is a silent skip
    // in every test above; the ids are asserted against the built course here.
    const ids = new Set(NUMBER_LESSONS.map((lesson) => lesson.id));
    for (const journey of JOURNEYS) expect(ids.has(journey.lesson), journey.lesson).toBe(true);
  });
});
