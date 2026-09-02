import { expect, test, type Page } from '@playwright/test';

import { NUMBER_LESSONS, getNumberLesson, numberLessonItems } from '../src/data/numbers';
import { masteryExercises, practiceExercises, type NumbersExercise } from '../src/features/numbers/exercises';
import { copy } from './helpers/copy';
import { openApp } from './helpers/launch';

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
    // Exactly one lesson is available; the rest are locked and are not links.
    await expect(page.locator('[data-testid^="numbers-lesson-"][data-status="available"]')).toHaveCount(1);
    const locked = page.locator('[data-testid^="numbers-lesson-"][data-status="locked"]');
    await expect(locked).toHaveCount(NUMBER_LESSONS.length - 1);
    await expect(locked.first().locator('a')).toHaveCount(0);

    // Open the first lesson, read the objective, and go straight back.
    await page.getByTestId(`numbers-lesson-${FIRST.id}`).getByRole('link').click();
    await expect(page.getByTestId('numbers-phase-objective')).toBeVisible();
    await page.goto('/letters/numbers');
    const row = page.getByTestId(`numbers-lesson-${FIRST.id}`);
    await expect(row).toHaveAttribute('data-status', 'not_started');
    await expect(row).toContainText(en('status.not_started'));
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
    // The next lesson unlocked; nothing else did.
    await expect(page.getByTestId('numbers-lesson-num-lesson-native-basics')).toHaveAttribute('data-status', 'available');
    await expect(page.getByTestId('numbers-lesson-num-lesson-zero')).toHaveAttribute('data-status', 'available');
    await expect(page.locator('[data-testid^="numbers-lesson-"][data-status="locked"]')).toHaveCount(NUMBER_LESSONS.length - 3);
  });

  test('N-e2e-4 · leaving mid-lesson and reloading resumes from the record', async ({ page }) => {
    await openApp(page, `/letters/numbers/${FIRST.id}`);
    await page.getByRole('button', { name: en('action.start') }).click();
    await page.getByRole('button', { name: en('action.next') }).click(); // one step read
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
      await expect(status).toContainText(en('feedback.answerWas'));
      await expect(status).toContainText(optionText(first, first.answer));
      const misconception = first.options[wrongIndex]!.misconception;
      await expect(status).toContainText(en(`rationale.${misconception ?? first.rationale.replace('rationale.', '')}`));
      // Options are frozen after one tap: a second tap changes nothing.
      const buttons = body.getByRole('group').getByRole('button');
      for (let i = 0; i < (await buttons.count()); i += 1) await expect(buttons.nth(i)).toBeDisabled();
    }
  });
});
