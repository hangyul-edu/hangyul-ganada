import { expect, test, type Page } from '@playwright/test';

import { NUMBER_LESSONS, getNumberLesson, numberLessonItems } from '../src/data/numbers';
import {
  MISCONCEPTION_FEEDBACK,
  masteryExercises,
  practiceExercises,
  type NumbersExercise,
} from '../src/features/numbers/exercises';
import { copy } from './helpers/copy';
import { openApp, waitForNumbersRecord } from './helpers/launch';

/**
 * The Numbers course, as a learner meets it in a browser.
 *
 * ## What only a browser can prove
 *
 * `numbersProgress.test.ts` proves the reducer and `numbersMigration.test.ts`
 * the store. What they cannot see is the seam this feature broke at: the
 * session page *deciding* a lesson was complete, and the overview *drawing*
 * it. So these journeys read the overview's status words and check marks after
 * real taps, reload the page mid-lesson to prove the record and not the screen
 * is what resumes, and answer everything wrong to prove that finishing the
 * screens is not finishing the lesson.
 *
 * ## How the test knows the answers
 *
 * The exercise generator is deterministic for a given attempt number, and the
 * first attempt of a fresh profile is attempt 0. The spec imports the same
 * generator and reads the answer text for each question — the app never shows
 * it. A key-valued option is resolved through the English bundle.
 */

const FIRST = getNumberLesson('num-lesson-sino-basics')!;
const en = (key: string) => copy('numbers', key);

function optionText(ex: NumbersExercise, index: number): string {
  const o = ex.options[index]!;
  if (o.isKey) return en(o.text);
  if (o.value !== undefined) return new Intl.NumberFormat('en').format(o.value);
  return o.text;
}

/** Objective → every explanation step → every example. */
async function readThrough(page: Page) {
  await page.getByRole('button', { name: en('action.start') }).click();
  for (let i = 0; i < FIRST.explanation.length; i += 1) {
    await expect(page.getByTestId('numbers-phase-explain')).toBeVisible();
    await page.getByRole('button', { name: en('action.next') }).click();
  }
  for (let i = 0; i < FIRST.item_ids.length; i += 1) {
    await expect(page.getByTestId('numbers-phase-examples')).toBeVisible();
    await page.getByRole('button', { name: en('action.next') }).click();
  }
}

/** Answers a run of exercises; `pick` chooses the option index for each. */
async function answerRun(
  page: Page,
  exercises: NumbersExercise[],
  phase: 'practice' | 'mastery',
  pick: (ex: NumbersExercise) => number,
) {
  await page.getByTestId(`numbers-phase-${phase}-intro`).waitFor();
  await page.getByRole('button', { name: en(phase === 'mastery' ? 'action.beginMastery' : 'action.beginPractice') }).click();
  for (const ex of exercises) {
    const body = page.getByTestId(`numbers-phase-${phase}`);
    await expect(body).toHaveAttribute('data-exercise-kind', ex.kind);
    if (ex.kind === 'order_parts') {
      for (const part of ex.parts!) {
        await body.locator('button[lang="ko"]:not([disabled])').filter({ hasText: new RegExp(`^${part}$`) }).first().click();
      }
    } else {
      const group = body.getByRole('group');
      await group.getByRole('button', { name: optionText(ex, pick(ex)), exact: true }).click();
    }
    // Feedback is explicit and the option list is frozen.
    await expect(body.getByRole('status')).toBeVisible();
    await page.getByRole('button', { name: en('action.continue') }).click();
  }
}

test.describe('the Numbers course', () => {
  test('N-e2e-1 · a fresh profile shows no lesson as completed, and opening one does not complete it', async ({ page }) => {
    await openApp(page, '/letters/numbers');
    await expect(page.getByTestId('numbers-lessons-completed')).toHaveText(
      en('lessonsCompleted').replace('{{done}}', '0').replace('{{total}}', String(NUMBER_LESSONS.length)),
    );
    const rows = page.locator('[data-testid^="numbers-lesson-"]');
    await expect(rows).toHaveCount(NUMBER_LESSONS.length);
    for (const status of ['completed', 'mastered', 'review_due']) {
      await expect(page.locator(`[data-testid^="numbers-lesson-"][data-status="${status}"]`)).toHaveCount(0);
    }
    /*
     * Every lesson is available, and every one of them is a link.
     *
     * This asserted the opposite until the course was unlocked: one available
     * lesson, seventeen `locked` rows, and the first locked row deliberately
     * *not* a link. The reasoning was that "hours" assumes "counting forms" —
     * a good argument for the order and a bad one for a door. See
     * `pages/NumbersPage`.
     */
    await expect(page.locator('[data-testid^="numbers-lesson-"][data-status="available"]')).toHaveCount(
      NUMBER_LESSONS.length,
    );
    // …and none of them says so. An availability badge on every row of a course
    // where nothing is locked is a word a learner learns to skip.
    await expect(page.locator('[data-testid^="numbers-lesson-"] [data-status]')).toHaveCount(0);
    await expect(page.locator('[data-testid^="numbers-lesson-"][data-status="locked"]')).toHaveCount(0);
    await expect(page.locator('[data-testid^="numbers-lesson-"] a')).toHaveCount(NUMBER_LESSONS.length);

    // Open the first lesson, read the objective, and go straight back.
    await page.getByTestId(`numbers-lesson-${FIRST.id}`).getByRole('link').click();
    await expect(page.getByTestId('numbers-phase-objective')).toBeVisible();
    await page.goto('/letters/numbers');
    const row = page.getByTestId(`numbers-lesson-${FIRST.id}`);
    await expect(row).toHaveAttribute('data-status', 'not_started');
    /*
     * Opened, and therefore still wearing no badge.
     *
     * The row used to say *Opened* here — and *Available* before it was touched
     * at all — which is a word on every row of a course where every lesson is
     * open. The state is still recorded, and the attribute above is how this
     * test reads it; what changed is that the screen no longer prints a label
     * whose only content is *you may do this*. See `pages/NumbersPage`.
     */
    await expect(row.locator('[data-status]')).toHaveCount(0);
    await expect(row.locator('svg')).toHaveCount(1); // the chevron only — no check mark
    await expect(page.getByTestId('numbers-lessons-completed')).toContainText('0 of');
  });

  test('N-e2e-2 · answering everything wrong finishes the screens but not the lesson', async ({ page }) => {
    await openApp(page, `/letters/numbers/${FIRST.id}`);
    await readThrough(page);
    const wrong = (ex: NumbersExercise) => (ex.answer + 1) % ex.options.length;
    await answerRun(page, practiceExercises(FIRST, 0), 'practice', wrong);
    // Practice attempts were recorded; mastery is seeded by mastery checks taken, still 0.
    await answerRun(page, masteryExercises(FIRST, 0), 'mastery', wrong);

    const summary = page.getByTestId('numbers-phase-summary');
    await expect(summary).toHaveAttribute('data-complete', 'false');
    await expect(summary).toContainText(en('summaryIncomplete'));
    await expect(summary).toContainText(en('summaryMissing.mastery'));

    await page.goto('/letters/numbers');
    const row = page.getByTestId(`numbers-lesson-${FIRST.id}`);
    await expect(row).toHaveAttribute('data-status', 'in_progress');
    await expect(page.locator('[data-testid^="numbers-lesson-"][data-status="completed"]')).toHaveCount(0);
    await expect(page.getByTestId('numbers-lessons-completed')).toContainText('0 of');
  });

  test('N-e2e-3 · a diligent learner completes the lesson, and only then is it marked', async ({ page }) => {
    await openApp(page, `/letters/numbers/${FIRST.id}`);
    await readThrough(page);
    await answerRun(page, practiceExercises(FIRST, 0), 'practice', (ex) => ex.answer);
    await answerRun(page, masteryExercises(FIRST, 0), 'mastery', (ex) => ex.answer);

    const summary = page.getByTestId('numbers-phase-summary');
    await expect(summary).toHaveAttribute('data-complete', 'true');
    await expect(summary).toContainText(en('summaryComplete'));
    await expect(summary).toContainText(en('masteryPerfect'));

    await page.goto('/letters/numbers');
    const row = page.getByTestId(`numbers-lesson-${FIRST.id}`);
    await expect(row).toHaveAttribute('data-status', 'mastered');
    await expect(row).toContainText(en('status.mastered'));
    await expect(page.getByTestId('numbers-lessons-completed')).toContainText('1 of');

    /*
     * One lesson finished, seventeen untouched — and untouched is not the same
     * word as unopened.
     *
     * This used to assert that finishing lesson one *unlocked* lessons two and
     * three. There are no locks now, so the interesting property has moved:
     * doing the work must mark exactly the lesson the work was done in. The
     * eighteen rows were all `available` before this test started, so a bug
     * that credited a neighbour would be invisible to a count of available
     * rows — what catches it is that no other row is finished.
     */
    const finished = page.locator(
      '[data-testid^="numbers-lesson-"][data-status="completed"], [data-testid^="numbers-lesson-"][data-status="mastered"]',
    );
    await expect(finished).toHaveCount(1);
    await expect(page.getByTestId('numbers-lesson-num-lesson-native-basics')).toHaveAttribute('data-status', 'available');
    await expect(page.getByTestId('numbers-lesson-num-lesson-zero')).toHaveAttribute('data-status', 'available');

    // And Continue has moved on to the next unfinished lesson.
    await expect(page.locator('[data-recommended="true"]')).toHaveCount(1);
  });

  test('N-e2e-4 · leaving mid-lesson and reloading resumes from the record', async ({ page }) => {
    await openApp(page, `/letters/numbers/${FIRST.id}`);
    await page.getByRole('button', { name: en('action.start') }).click();
    await page.getByRole('button', { name: en('action.next') }).click(); // one step read
    // The record, not the screen, is what a reload comes back to — so wait for
    // the write rather than for React. See `waitForNumbersRecord`.
    await waitForNumbersRecord(page, FIRST.id, (r) => (r.explanation_steps_viewed ?? []).length === 1);
    await page.reload();
    // Straight back into the explanation, at the first step not yet read —
    // not the objective, not step one again, not the practice.
    await expect(page.getByTestId('numbers-phase-explain')).toBeVisible();
    await expect(page.getByTestId('numbers-phase-explain')).toContainText(
      en('stepOf').replace('{{current}}', '2').replace('{{total}}', String(FIRST.explanation.length)),
    );
    // And the overview agrees about where the learner is.
    await page.goto('/letters/numbers');
    await expect(page.getByTestId(`numbers-lesson-${FIRST.id}`)).toHaveAttribute('data-status', 'in_progress');
    await expect(page.getByTestId(`numbers-lesson-${FIRST.id}`)).toContainText(
      en('activitiesDone').replace('{{done}}', '1').replace('{{total}}', String(FIRST.explanation.length + FIRST.item_ids.length + 2)),
    );
  });

  test('N-e2e-5 · every example plays audio and the feedback names the mistake', async ({ page }) => {
    await openApp(page, `/letters/numbers/${FIRST.id}`);
    await page.getByRole('button', { name: en('action.start') }).click();
    for (let i = 0; i < FIRST.explanation.length; i += 1) await page.getByRole('button', { name: en('action.next') }).click();
    const items = numberLessonItems(FIRST);
    for (const item of items) {
      const card = page.getByTestId('numbers-example-card');
      await expect(card).toContainText(item.korean);
      // A real, enabled speaker — not the struck-through "unavailable" state.
      await expect(card.getByRole('button', { name: item.korean })).toBeEnabled();
      await page.getByRole('button', { name: en('action.next') }).click();
    }
    const exercises = practiceExercises(FIRST, 0);
    await page.getByRole('button', { name: en('action.beginPractice') }).click();
    const first = exercises[0]!;
    const body = page.getByTestId('numbers-phase-practice');
    if (first.kind !== 'order_parts') {
      const wrongIndex = (first.answer + 1) % first.options.length;
      await body.getByRole('group').getByRole('button', { name: optionText(first, wrongIndex), exact: true }).click();
      const status = body.getByRole('status');
      await expect(status).toContainText(en('feedback.incorrect'));
      /*
        And nothing else about *which* answer was right.

        This used to assert `feedback.answerWas` and the correct option's text,
        pinning a line — `정답은 8` — that said for the third time what the
        screen had already said twice: the tapped option carries a red cross,
        the right one a blue tick, and both marks carry their own
        screen-reader text on the option itself. On a bare numeral question,
        where there is no rule to explain either, it was the only thing in the
        feedback box.

        The assertion is inverted rather than dropped, because "the screen does
        not restate the answer" is the property that was wanted and the old
        line is exactly what would come back.
      */
      await expect(status).not.toContainText(optionText(first, first.answer));
      /*
       * A wrong answer always gets a body, and it is the line written for the
       * mistake when the distractor carries one.
       *
       * Two arrangements ago this compared against a fixed sentence per
       * exercise kind. One ago it compared against a template interpolated with
       * the item — which is what produced *사는 4예요* on the way *out* of a
       * correct answer. The source of truth is now the exercise's own typed
       * feedback, so the assertion reads it rather than reconstructing it.
       */
      const misconception = first.options[wrongIndex]!.misconception;
      const key = (misconception ? MISCONCEPTION_FEEDBACK[misconception] : null) ?? first.feedback.incorrect;
      const answered = numberLessonItems(FIRST).find((item) => item.id === first.item_id)!;
      // A plain numeral has no body: the answer line above is the correction.
      const filled = key === null ? null : en(key)
        .replaceAll('{{korean}}', answered.korean)
        .replaceAll('{{subject}}', answered.korean)
        .replaceAll('{{object}}', answered.korean)
        .replaceAll('{{value}}', answered.value === null ? '' : String(answered.value))
        .replaceAll('{{example}}', answered.example ?? '');
      if (filled !== null) await expect(status).toContainText(filled);
      // Options are frozen after one tap: a second tap changes nothing.
      const buttons = body.getByRole('group').getByRole('button');
      for (let i = 0; i < (await buttons.count()); i += 1) await expect(buttons.nth(i)).toBeDisabled();
    }
  });

  test('N-e2e-5c · the soft verdict is gone from the product', async ({ page }) => {
    /*
      조금 달라요 — "it's a little different" — softened a judgement the screen
      had already delivered in red, leaving a learner to work out whether it
      counted. Asserted against the shipped bundle rather than the source, so a
      string reintroduced anywhere that renders is caught.
    */
    await openApp(page, `/letters/numbers/${FIRST.id}`);
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('조금 달라요');
    expect(en('feedback.incorrect')).not.toBe('조금 달라요');
  });

  test('N-e2e-5b · a correct answer says 맞았어요 and nothing a learner already knows', async ({ page }) => {
    /*
     * The photographed defect: 사 → 4, answered correctly, with *사는 4예요*
     * underneath. The question's whole content was that 사 is 4.
     *
     * Asserted on the rendered screen rather than on the data, because the
     * empty wrapper was as much of the fault as the sentence — a gap that
     * appears under some verdicts and not others reads as something failing to
     * load.
     */
    await openApp(page, `/letters/numbers/${FIRST.id}`);
    await page.getByRole('button', { name: en('action.start') }).click();
    for (let i = 0; i < FIRST.explanation.length; i += 1) await page.getByRole('button', { name: en('action.next') }).click();
    for (let i = 0; i < numberLessonItems(FIRST).length; i += 1) await page.getByRole('button', { name: en('action.next') }).click();

    const exercises = practiceExercises(FIRST, 0);
    const first = exercises[0]!;
    if (first.kind === 'order_parts') return;
    await page.getByRole('button', { name: en('action.beginPractice') }).click();
    const body = page.getByTestId('numbers-phase-practice');
    await body.getByRole('group').getByRole('button', { name: optionText(first, first.answer), exact: true }).click();

    const status = body.getByRole('status');
    await expect(status).toContainText(en('feedback.correct'));
    /*
     * The item this lesson opens with carries no authored note, so there is no
     * body at all — not an empty one. The verdict's own headline is a <p>, so
     * the count that matters is one: the headline and nothing under it.
     */
    expect(first.feedback.correct).toBeNull();
    await expect(status.locator('p')).toHaveCount(1);
    await expect(status.locator('[class*="body"]')).toHaveCount(0);
  });

  test('N-e2e-6 · a new learner can open any lesson in the course, in any order', async ({ page }) => {
    /*
     * The reported defect, from the far end of the course.
     *
     * Somebody who has just been asked their age in Korean wants "몇 살이에요?"
     * today, not after four other lessons. So the last lesson of every module
     * is opened directly on a profile that has done nothing at all — a deep
     * link, which is also the harshest case for the record: there is no
     * history behind it and no prerequisite satisfied.
     */
    const lastOfEachModule = ['num-lesson-choosing', 'num-lesson-forms', 'num-lesson-age', 'num-lesson-weekdays', 'num-lesson-large', 'num-lesson-mixed'];
    for (const id of lastOfEachModule) {
      const lesson = getNumberLesson(id)!;
      await openApp(page, `/letters/numbers/${id}`);
      await expect(page.getByTestId('numbers-phase-objective')).toBeVisible();
      await expect(page.getByRole('button', { name: en('action.start') })).toBeVisible();
      // Named, so a failure says which lesson rather than which index.
      expect(lesson.prerequisites.length, `${id} still declares a recommended order`).toBeGreaterThan(0);
    }

    // And none of that opening counted as progress.
    await page.goto('/letters/numbers');
    await expect(page.getByTestId('numbers-lessons-completed')).toContainText('0 of');
    await expect(page.locator('[data-testid^="numbers-lesson-"][data-status="completed"]')).toHaveCount(0);
  });

  test('N-e2e-7 · Continue leads to the first unfinished lesson without forcing it', async ({ page }) => {
    /*
     * What is left of the prerequisite chain: a recommendation. It has to
     * actually point somewhere, and it has to not be the only way in.
     */
    await openApp(page, '/letters/numbers');
    const cta = page.getByTestId('numbers-continue');
    await expect(cta).toBeVisible();
    await cta.click();
    await expect(page).toHaveURL(new RegExp(`/letters/numbers/${NUMBER_LESSONS[0]!.id}$`));
    await expect(page.getByTestId('numbers-phase-objective')).toBeVisible();

    // The row it points at says so, and the others do not.
    await page.goto('/letters/numbers');
    await expect(page.locator('[data-recommended="true"]')).toHaveCount(1);
  });

  test('N-e2e-8 · every lesson row and the course header carry a back control', async ({ page }) => {
    // §10: every page, including the ones a learner deep-links into.
    await openApp(page, '/letters/numbers/num-lesson-age');
    await expect(page.getByTestId('app-back')).toHaveCount(1);
    await openApp(page, '/letters/numbers');
    await expect(page.getByTestId('app-back')).toHaveCount(1);
  });
});
