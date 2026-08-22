/**
 * What Word Detail is allowed to say about other words.
 *
 * The screen used to end with a section headed *비슷한 낱말* — "words like
 * this" — whose contents were the four words nearest this one in the same
 * category. Under 고기 that read:
 *
 *     비슷한 낱말
 *     사과   둥글고 빨간 과일
 *     음식   사람이 먹는 것
 *     먹다   ...
 *     우유   ...
 *
 * Four words off the food shelf, under a heading that says a dictionary found
 * them alike. It did not; a sort did. These tests hold the replacement to the
 * rule that fixes it: **the only relations shown are ones a dictionary states,
 * named as what they are, and an absence is shown as an absence.**
 */
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { PronunciationProvider } from '../audio/PronunciationProvider';
import { relationsOf, wordsWithRelations } from '../data/relations';
import { VOCABULARY, getWord } from '../data/vocabulary';
import { createI18n } from '../i18n/config';
import { LocaleContext, type LocaleContextValue } from '../i18n/LocaleContext';
import { LearnerProvider } from '../store/LearnerProvider';
import { WordDetailPage } from './WordDetailPage';

const locale = {
  locale: 'en',
  descriptor: { code: 'en' },
  direction: 'ltr',
  source: 'default',
  available: [],
  setLocale: async () => {},
  suggestion: null,
  // Meanings are read in the same language here — see `i18n/contentLocale.ts`.
  contentLocale: 'en',
  contentIsBorrowed: false,
  contentLocales: [],
  setContentLocale: () => {},
} as unknown as LocaleContextValue;

/** The real string bundles, so the headings assert the copy a learner reads. */
const i18n = createI18n('en');

function open(wordId: string) {
  return render(
    <I18nextProvider i18n={i18n}>
      <LearnerProvider>
        <PronunciationProvider voice="female">
          <LocaleContext.Provider value={locale}>
            <MemoryRouter initialEntries={[`/words/word/${wordId}`]}>
              <Routes>
                <Route path="/words/word/:wordId" element={<WordDetailPage />} />
              </Routes>
            </MemoryRouter>
          </LocaleContext.Provider>
        </PronunciationProvider>
      </LearnerProvider>
    </I18nextProvider>,
  );
}

const byWord = (word: string) => VOCABULARY.find((entry) => entry.word === word);

describe('고기 — the entry this was found on', () => {
  const gogi = byWord('고기');

  it('is still in the vocabulary, so the fixture is testing something', () => {
    expect(gogi).toBeDefined();
  });

  it.each(['사과', '음식', '먹다', '우유'])(
    'does not claim %s is a synonym or an antonym of it',
    (other) => {
      const shown = [...relationsOf(gogi!.id).synonyms, ...relationsOf(gogi!.id).antonyms];
      expect(shown.map((entry) => entry.word)).not.toContain(other);
    },
  );

  it('shows neither section, rather than a shorter list of food words', () => {
    open(gogi!.id);
    // The headword is there — this is the page, not a 404.
    expect(screen.getByTestId('detail-headword')).toHaveTextContent('고기');
    expect(screen.queryByRole('heading', { name: 'Synonyms' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Opposites' })).not.toBeInTheDocument();
    // And nothing under any other name either. The old fallback is gone, not
    // renamed — a "related words" block would pass the two checks above.
    expect(screen.queryByText('사과')).not.toBeInTheDocument();
    expect(screen.queryByText('음식')).not.toBeInTheDocument();
  });
});

describe('a word the dictionary does describe', () => {
  it('shows its synonyms under a synonym heading', () => {
    const bright = byWord('밝다')!;
    expect(relationsOf(bright.id).synonyms.map((w) => w.word)).toContain('환하다');
    open(bright.id);
    expect(screen.getByRole('heading', { name: 'Synonyms' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '환하다' })).toBeInTheDocument();
  });

  it('shows its antonyms under an antonym heading', () => {
    const bright = byWord('밝다')!;
    expect(relationsOf(bright.id).antonyms.map((w) => w.word)).toContain('어둡다');
    open(bright.id);
    expect(screen.getByRole('heading', { name: 'Opposites' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '어둡다' })).toBeInTheDocument();
  });

  it('shows only the heading it has data for', () => {
    // 함께/같이 is a synonym pair with no antonym stated either way.
    const together = byWord('함께')!;
    expect(relationsOf(together.id).antonyms).toHaveLength(0);
    open(together.id);
    expect(screen.getByRole('heading', { name: 'Synonyms' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Opposites' })).not.toBeInTheDocument();
  });

  it('opens the related word when it is tapped', async () => {
    const bright = byWord('밝다')!;
    open(bright.id);
    await userEvent.click(screen.getByRole('button', { name: '어둡다' }));
    expect(screen.getByTestId('detail-headword')).toHaveTextContent('어둡다');
  });
});

describe('the relation data as a whole', () => {
  it('never points at a word the app does not ship, so no link is dead', () => {
    for (const wordId of wordsWithRelations()) {
      const { synonyms, antonyms } = relationsOf(wordId);
      for (const target of [...synonyms, ...antonyms]) {
        expect(getWord(target.id)).toBeDefined();
      }
    }
  });

  it('is stated from both ends', () => {
    // The sense check that costs nothing: 남자 says 여자 and 여자 says 남자. A
    // one-sided entry is where a synonym from one meaning gets attached to a
    // different one, and it is invisible from the page that carries it.
    for (const wordId of wordsWithRelations()) {
      const { synonyms, antonyms } = relationsOf(wordId);
      for (const target of synonyms) {
        expect(relationsOf(target.id).synonyms.map((w) => w.id)).toContain(wordId);
      }
      for (const target of antonyms) {
        expect(relationsOf(target.id).antonyms.map((w) => w.id)).toContain(wordId);
      }
    }
  });

  it('is the exception, not the rule — most words have nothing to show', () => {
    /*
     * Guards the direction of the fix. If a future change reintroduces a
     * computed fallback, this number jumps towards the whole corpus, and that
     * is the single clearest signal that relations have stopped being
     * dictionary facts.
     */
    expect(wordsWithRelations().length).toBeLessThan(VOCABULARY.length / 4);
  });

  it('never lists a word as its own synonym or opposite', () => {
    for (const wordId of wordsWithRelations()) {
      const { synonyms, antonyms } = relationsOf(wordId);
      expect([...synonyms, ...antonyms].map((w) => w.id)).not.toContain(wordId);
    }
  });

  it('shares no word between a headword’s synonyms and its opposites', () => {
    for (const wordId of wordsWithRelations()) {
      const { synonyms, antonyms } = relationsOf(wordId);
      const opposites = new Set(antonyms.map((w) => w.id));
      expect(synonyms.filter((w) => opposites.has(w.id))).toHaveLength(0);
    }
  });
});
