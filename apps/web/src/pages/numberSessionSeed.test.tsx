/**
 * The Numbers question order is seeded from the learner's *stored* attempt
 * count, not from the blank record a screen sees before the store has answered.
 *
 * I-204 recorded the risk by reading the code: `ExerciseRun` takes `attempt`
 * from `record ?? blankLessonProgress(...)` in a `useState` initialiser, and a
 * screen that reads learner state before hydration reads the blank — the shape
 * that produced I-203 on the Letters side. What this file settles is whether a
 * run can *mount* before hydration at all. It mounts the page over a store that
 * answers slowly, with a record on which this is the learner's fourth run, and
 * reads the first question off the screen.
 *
 * The oracle is the exercise builder itself, called with the stored count and
 * with zero; the test is only meaningful where the two disagree, and it checks
 * that before asserting anything.
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { PronunciationProvider } from '../audio/PronunciationProvider';
import { NUMBER_LESSONS } from '../data/numbers';
import { blankLessonProgress } from '../domain/numbersProgress';
import { practiceExercises, type NumbersExercise } from '../features/numbers/exercises';
import { createI18n } from '../i18n/config';
import { LocaleContext, type LocaleContextValue } from '../i18n/LocaleContext';
import { MemoryDriver, type PersistenceDriver, type StoreName } from '../storage/driver';
import { META_KEY, SCHEMA_VERSION } from '../storage/schema';
import { LearnerProvider } from '../store/LearnerProvider';
import { NumberSessionPage } from './NumberSessionPage';

const locale = {
  locale: 'en',
  descriptor: { code: 'en' },
  direction: 'ltr',
  source: 'default',
  available: [],
  setLocale: async () => {},
  suggestion: null,
  contentLocale: 'en',
  contentIsBorrowed: false,
  contentLocales: [],
  setContentLocale: () => {},
} as unknown as LocaleContextValue;

const LESSON = NUMBER_LESSONS.find((l) => l.id === 'num-lesson-sino-basics')!;

/** A durable store that takes its time answering — the race, made reliable. */
function slowDriver(delayMs = 40): MemoryDriver {
  const driver = new MemoryDriver();
  const later = <T,>(value: T) =>
    new Promise<T>((resolve) => setTimeout(() => resolve(value), delayMs));
  return new Proxy(driver, {
    get(target, key) {
      if (key === 'durable') return true;
      if (key === 'name') return 'indexeddb';
      if (key === 'get' || key === 'getAll' || key === 'entries') {
        // Bound to the driver: an unbound method call loses `this`, the read
        // throws, hydration fails over to an empty profile, and a test that
        // wanted a slow store gets a broken one that looks the same from the
        // outside.
        const method = Reflect.get(target, key, target) as (...a: unknown[]) => Promise<unknown>;
        return async (...args: [StoreName, string]) => later(await method.apply(target, args));
      }
      return Reflect.get(target, key, target);
    },
  }) as MemoryDriver;
}

/**
 * A learner who has read the whole lesson and run the practice three times.
 * `resumePhase` sends them straight to practice; the seed is the fourth run.
 */
function returningRecord(attempts: number) {
  const row = blankLessonProgress(LESSON.id, new Date('2026-09-01T09:00:00Z'));
  return {
    ...row,
    opened_at: '2026-09-01T09:00:00.000Z',
    started_at: '2026-09-01T09:00:00.000Z',
    explanation_steps_viewed: LESSON.explanation.map((s) => s.text),
    examples_viewed: [...LESSON.item_ids],
    attempts: { total: attempts, correct: attempts, incorrect: 0 },
  };
}

const i18n = createI18n('en');

function open(driver: PersistenceDriver) {
  return render(
    <I18nextProvider i18n={i18n}>
      <LearnerProvider driver={driver}>
        <PronunciationProvider voice="female">
          <LocaleContext.Provider value={locale}>
            <MemoryRouter initialEntries={[`/letters/numbers/${LESSON.id}`]}>
              <Routes>
                <Route path="/letters/numbers/:lessonId" element={<NumberSessionPage />} />
              </Routes>
            </MemoryRouter>
          </LocaleContext.Provider>
        </PronunciationProvider>
      </LearnerProvider>
    </I18nextProvider>,
  );
}

/** What the first question would show, per the builder, for a given seed. */
function firstQuestion(attempt: number): { kind: string; options: string[] } {
  const first: NumbersExercise = practiceExercises(LESSON, attempt, { soundFree: false })[0]!;
  return { kind: first.kind, options: first.options.map((o) => o.text) };
}

describe('a Numbers run opened before the store has answered', () => {
  // The stored count must produce a different first question from the blank
  // record's zero, or the assertion below would pass on either seed.
  const STORED = [3, 4, 5, 6, 7].find((n) => {
    const a = firstQuestion(n);
    const b = firstQuestion(0);
    return a.kind !== b.kind || a.options.join('|') !== b.options.join('|');
  });

  it('has a seed that distinguishes the stored count from a blank record', () => {
    expect(STORED).toBeDefined();
  });

  it('seeds the question order from the stored attempt count, not from the blank', async () => {
    const attempts = STORED!;
    const driver = slowDriver();
    // A store already at the current schema, as a returning install's is —
    // otherwise the migration ladder runs from zero and the Numbers cleanup
    // (schema 13) empties the very row this test plants.
    await driver.put('meta', META_KEY, {
      schema_version: SCHEMA_VERSION,
      installed_at: '2026-09-01T09:00:00.000Z',
      last_opened_at: '2026-09-01T09:00:00.000Z',
      install_id: 'test-install',
    });
    await driver.put('numbers', `lesson:${LESSON.id}`, returningRecord(attempts));

    open(driver);

    // The learner has read everything: the screen resumes at the practice
    // intro, and only once the record has been read — never at "Start lesson".
    const begin = await screen.findByRole('button', { name: 'Start practising' }, { timeout: 5000 });
    await act(async () => {
      begin.click();
    });

    const body = await screen.findByTestId('numbers-phase-practice');
    await waitFor(() => expect(body.getAttribute('data-exercise-kind')).toBeTruthy());

    const expected = firstQuestion(attempts);
    expect(body.getAttribute('data-exercise-kind')).toBe(expected.kind);

    // The options as drawn, in order. Numeric options render through `Intl`
    // and key options through i18n; the builder's `text` is what both start
    // from, so compare against the on-screen text of the exercise's own
    // option objects rather than a re-rendering of them.
    const rendered = [...body.querySelectorAll('[role="group"] button')].map((b) =>
      (b.textContent ?? '').trim(),
    );
    const blank = firstQuestion(0);
    const matches = (q: { options: string[] }) =>
      q.options.every((text, i) => rendered[i] !== undefined && rendered[i]!.includes(text));
    if (expected.kind === blank.kind) {
      expect(matches(expected)).toBe(true);
      expect(matches(blank)).toBe(false);
    }
  });
});
