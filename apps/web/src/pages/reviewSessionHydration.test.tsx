/**
 * The review session waits for the store, and then has something to ask.
 *
 * The twin of `wordSessionHydration.test.tsx`, for the twin defect. The
 * router mounts as soon as the corpus core is in, and the profile can still
 * be on its way from IndexedDB at that moment. This screen resolves its plan
 * once, on mount, and keeps it — deliberately, so that answering a question
 * cannot shorten the queue under the learner — and a plan resolved over the
 * empty placeholder is an empty plan that stays empty: *Nothing to review
 * right now*, to a learner with twelve words due, until they leave and come
 * back.
 *
 * Invisible on a fast machine, which is how it shipped, and seen first as two
 * e2e cases (`choice-layout.spec.ts`, ko and ar) failing only inside a
 * half-hour run. This mounts the screen over a store that answers *slowly*,
 * with due words already in it, and asks for the question.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { PronunciationProvider } from '../audio/PronunciationProvider';
import { VOCABULARY } from '../data/vocabulary';
import { createI18n } from '../i18n/config';
import { LocaleContext, type LocaleContextValue } from '../i18n/LocaleContext';
import { MemoryDriver, type PersistenceDriver, type StoreName } from '../storage/driver';
import { LearnerProvider } from '../store/LearnerProvider';
import { ReviewSessionPage } from './ReviewSessionPage';

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

/** Twelve words met two days ago and lost, in the rows the store writes. */
async function seedDueWords(driver: MemoryDriver, count: number) {
  const when = new Date(Date.now() - 2 * 864e5).toISOString();
  for (const word of VOCABULARY.slice(0, count)) {
    await driver.put('progress', `word:${word.id}`, {
      item_key: word.id, kind: 'word', stage: 'introduced', attempts: 1, passes: 0, fails: 1,
      trace_passes: 0, write_passes: 0, recognition_passes: 0, heard: true, learned: false,
      needs_review: true, last_score: 0, first_seen_at: when, last_attempted_at: when,
      learned_at: null, review_due_at: when,
    });
    for (const skill of ['meaning_recognition', 'reading_recognition', 'sentence_comprehension']) {
      await driver.put('memory', `word:${word.id}:${skill}`, {
        item_key: `word:${word.id}`, skill, stability_days: 0.4, difficulty: 0.8, reps: 1,
        lapses: 1, last_at: when, due_at: when, last_score: 0,
      });
    }
  }
}

/** A durable store that takes its time answering — the condition itself. */
function slow(driver: MemoryDriver, delayMs = 30): PersistenceDriver {
  const later = <T,>(value: T) =>
    new Promise<T>((resolve) => setTimeout(() => resolve(value), delayMs));
  return new Proxy(driver, {
    get(target, key) {
      if (key === 'durable') return true;
      if (key === 'name') return 'indexeddb';
      if (key === 'get' || key === 'getAll') {
        const method = Reflect.get(target, key, target) as (...a: unknown[]) => Promise<unknown>;
        return async (...args: [StoreName, string]) => later(await method.apply(target, args));
      }
      return Reflect.get(target, key, target);
    },
  });
}

const i18n = createI18n('en');

function openSession(driver: PersistenceDriver) {
  return render(
    <I18nextProvider i18n={i18n}>
      <LearnerProvider driver={driver}>
        <PronunciationProvider voice="female">
          <LocaleContext.Provider value={locale}>
            <MemoryRouter initialEntries={['/review/session?mode=read']}>
              <ReviewSessionPage />
            </MemoryRouter>
          </LocaleContext.Provider>
        </PronunciationProvider>
      </LearnerProvider>
    </I18nextProvider>,
  );
}

describe('a review session opened before the store has answered', () => {
  it('asks the first question once the profile arrives, rather than claiming nothing is due', async () => {
    const driver = new MemoryDriver();
    await seedDueWords(driver, 12);
    openSession(slow(driver));

    await waitFor(() => expect(screen.getByRole('group')).toBeInTheDocument());
    expect(screen.queryByText('Nothing to review right now.')).not.toBeInTheDocument();
  });

  it('never shows the empty state on the way there', async () => {
    const driver = new MemoryDriver();
    await seedDueWords(driver, 12);
    const { container } = openSession(slow(driver));

    const sightings: string[] = [];
    const observer = new MutationObserver(() => {
      if (container.textContent?.includes('Nothing to review right now.')) {
        sightings.push(container.textContent);
      }
    });
    observer.observe(container, { childList: true, subtree: true, characterData: true });

    await waitFor(() => expect(screen.getByRole('group')).toBeInTheDocument());
    observer.disconnect();
    expect(sightings).toEqual([]);
  });

  it('still says so, once it knows, when nothing is due', async () => {
    // The empty state is not gone; it is late. A profile with nothing to
    // review reaches it after hydration, not before.
    openSession(slow(new MemoryDriver()));
    await waitFor(() => expect(screen.getByText('Nothing to review right now.')).toBeInTheDocument());
  });
});
