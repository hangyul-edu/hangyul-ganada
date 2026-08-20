/**
 * The session waits for the store, and then has a day in it.
 *
 * The plan lives in IndexedDB and is read asynchronously, so for the first
 * render or two of any screen there is no plan — deliberately, because a
 * placeholder that looked like a real plan is what used to get written over the
 * learner's actual one.
 *
 * This screen freezes its queue once and keeps it, so that answering a question
 * cannot shorten the queue under the learner. Those two facts met badly: the
 * freeze happened on the first render, the first render had the empty
 * placeholder, and the session opened on its own *nothing to do today* backstop
 * with a full day of words sitting in the database behind it.
 *
 * The worst part was that it was invisible on a small profile — hydration
 * usually wins the race from an empty database — so it only appeared once a
 * learner had enough history for the read to take a moment. This mounts the
 * screen over a store that answers *slowly*, which is the condition, and asks
 * for the word.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { PronunciationProvider } from '../audio/PronunciationProvider';
import { createI18n } from '../i18n/config';
import { LocaleContext, type LocaleContextValue } from '../i18n/LocaleContext';
import { MemoryDriver, type PersistenceDriver, type StoreName } from '../storage/driver';
import { LearnerProvider } from '../store/LearnerProvider';
import { WordSessionPage } from './WordSessionPage';

const locale = {
  locale: 'en',
  descriptor: { code: 'en' },
  direction: 'ltr',
  source: 'default',
  available: [],
  setLocale: async () => {},
  suggestion: null,
} as unknown as LocaleContextValue;

/**
 * A durable store that takes its time answering.
 *
 * The delay is what makes the test meaningful: with an instant driver the race
 * is always won and the bug is invisible, which is exactly how it shipped.
 */
function slowDriver(delayMs = 30): PersistenceDriver {
  const driver = new MemoryDriver();
  const later = <T,>(value: T) =>
    new Promise<T>((resolve) => setTimeout(() => resolve(value), delayMs));
  return new Proxy(driver, {
    get(target, key) {
      if (key === 'durable') return true;
      if (key === 'name') return 'indexeddb';
      if (key === 'get' || key === 'getAll') {
        return async (...args: [StoreName, string]) =>
          later(await (Reflect.get(target, key, target) as (...a: unknown[]) => Promise<unknown>)(...args));
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
            <MemoryRouter initialEntries={['/words/today']}>
              <WordSessionPage />
            </MemoryRouter>
          </LocaleContext.Provider>
        </PronunciationProvider>
      </LearnerProvider>
    </I18nextProvider>,
  );
}

describe("today's session, opened before the store has answered", () => {
  it('shows the day once it arrives, rather than claiming there is none', async () => {
    openSession(slowDriver());

    // The word, when the plan lands. `word-headword` is the meeting card, which
    // is the first thing a sitting shows.
    await waitFor(() => expect(screen.getByTestId('word-headword')).toBeInTheDocument());
    expect(screen.getByTestId('word-headword').textContent?.trim()).not.toBe('');
  });

  it('never shows the empty-day card on the way there', async () => {
    /*
     * The failure mode, asserted directly. "Nothing left for today" is a
     * statement about the learner's day, and making it before the day has been
     * read is worse than making them wait: they leave, and the words they were
     * promised are still sitting there.
     */
    const { container } = openSession(slowDriver());
    const sightings: string[] = [];
    const observer = new MutationObserver(() => {
      if (container.textContent?.includes('Nothing left for today')) {
        sightings.push(container.textContent);
      }
    });
    observer.observe(container, { childList: true, subtree: true, characterData: true });

    await waitFor(() => expect(screen.getByTestId('word-headword')).toBeInTheDocument());
    observer.disconnect();
    expect(sightings).toEqual([]);
  });
});
