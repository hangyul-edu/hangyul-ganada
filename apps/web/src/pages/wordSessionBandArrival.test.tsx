/**
 * The day's words arrive after the screen does, and the queue is rebuilt for them.
 *
 * The corpus is fetched in priority bands: the first 600 words land with the
 * launch and the rest follow in the background. A learner measured near the
 * top of the scale has a plan made entirely of words from the *last* band, so
 * every one of their sittings opens before its own content exists.
 *
 * `buildDailyQuestions` reads the corpus — `getWord` for each scheduled step —
 * and drops a step whose word is not in memory yet. That is correct, and it
 * made the queue empty on the first render. What was not correct is that the
 * queue was a plain `useMemo` over the steps and the language, and a band
 * arriving changes neither: the component re-rendered when the corpus
 * announced itself, kept its cached empty queue, and the loading guard — which
 * asks `corpusReady()` — let go at exactly the same moment. The learner was
 * told *Nothing left for today* over a full day of words, and it never
 * recovered, because nothing was ever going to recompute the queue.
 *
 * It passed every time on a fast machine, where the whole corpus is in before
 * the session is opened, and failed inside `verify:release` behind a spec that
 * had just spent five minutes of the same worker. That is a real learner on a
 * slow connection, not a slow test.
 *
 * This stages the sequence exactly — a plan whose words have not arrived, then
 * the band, then the announcement the loader really makes — and asserts the
 * two things that were wrong: the empty day is never announced, and the words
 * appear on their own when they land.
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PronunciationProvider } from '../audio/PronunciationProvider';
import { announceContent } from '../data/corpus';
import { createI18n } from '../i18n/config';
import { LocaleContext, type LocaleContextValue } from '../i18n/LocaleContext';
import { MemoryDriver, type PersistenceDriver } from '../storage/driver';
import type * as CorpusModule from '../data/corpus';
import type * as VocabularyModule from '../data/vocabulary';
import { LearnerProvider } from '../store/LearnerProvider';
import { WordSessionPage } from './WordSessionPage';

/**
 * Whether the band holding this learner's words has arrived.
 *
 * Module scope, because the two mock factories below are hoisted above
 * everything else in the file; flipping it is the whole of "the band landed".
 * The plan is still built from the real corpus — only the *session's* reads
 * are held back, which is the half of the race this is about.
 */
let bandHasLanded = false;

vi.mock('../data/vocabulary', async (importOriginal) => {
  const actual = await importOriginal<typeof VocabularyModule>();
  return {
    ...actual,
    getWord: (id: string) => (bandHasLanded ? actual.getWord(id) : undefined),
  };
});

vi.mock('../data/corpus', async (importOriginal) => {
  const actual = await importOriginal<typeof CorpusModule>();
  return { ...actual, corpusReady: () => bandHasLanded };
});

const locale = {
  locale: 'en',
  descriptor: { code: 'en' },
  direction: 'ltr',
  source: 'default',
  available: [],
  setLocale: async () => {},
  contentLocale: 'en',
  contentIsBorrowed: false,
  contentLocales: [],
  setContentLocale: () => {},
  suggestion: null,
} as unknown as LocaleContextValue;

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

async function pastPlacement() {
  const skip = await screen.findByTestId('placement-skip');
  await act(async () => {
    skip.click();
  });
}

/** What the loader does when a band of words installs. */
async function deliverTheBand() {
  bandHasLanded = true;
  await act(async () => {
    announceContent();
  });
}

describe("today's session, opened before its own band has arrived", () => {
  beforeEach(() => {
    bandHasLanded = false;
  });

  it('waits, rather than claiming the day is empty', async () => {
    const { container } = openSession(new MemoryDriver());
    await pastPlacement();

    await waitFor(() => expect(screen.getByTestId('words-loading')).toBeInTheDocument());
    expect(container.textContent).not.toContain('Nothing left for today');
  });

  it('shows the day when the band lands, without being asked again', async () => {
    openSession(new MemoryDriver());
    await pastPlacement();
    await waitFor(() => expect(screen.getByTestId('words-loading')).toBeInTheDocument());

    await deliverTheBand();

    /*
     * The half that was missing. A guard alone would have turned a permanent
     * wrong sentence into a permanent spinner: the queue has to be rebuilt when
     * the words arrive, and nothing in its old dependency list ever changed.
     */
    await waitFor(() => expect(screen.getByTestId('word-headword')).toBeInTheDocument());
    expect(screen.getByTestId('word-headword').textContent?.trim()).not.toBe('');
  });

  it('never shows the empty-day card on the way there', async () => {
    const { container } = openSession(new MemoryDriver());
    await pastPlacement();
    const sightings: string[] = [];
    const observer = new MutationObserver(() => {
      if (container.textContent?.includes('Nothing left for today')) {
        sightings.push(container.textContent);
      }
    });
    observer.observe(container, { childList: true, subtree: true, characterData: true });

    await waitFor(() => expect(screen.getByTestId('words-loading')).toBeInTheDocument());
    await deliverTheBand();
    await waitFor(() => expect(screen.getByTestId('word-headword')).toBeInTheDocument());
    observer.disconnect();

    expect(sightings).toEqual([]);
  });
});
