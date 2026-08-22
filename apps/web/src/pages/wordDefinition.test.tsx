/**
 * The *More about it* section, and the rule that it is written.
 *
 * The section existed before this and nobody had written a word of it. The
 * build filled it from the dictionary's second and third senses, which put
 * "phylum" under 문, "graveyard" under 산 and "prophase" under 전기, on 784
 * words, in English only — so a Japanese learner opened the same screen and
 * found the heading simply absent.
 *
 * Two properties replace it, and both are here because either one alone is
 * satisfiable by doing nothing. The section has to *appear*, with authored text,
 * on the words a one-line gloss genuinely misleads; and it has to be *absent*
 * from the rest, because a paragraph under every word is a paragraph a learner
 * scrolls past.
 *
 * The all-languages-or-none half is checked where the data is —
 * `npm run vocabulary:sense:qa` compares the ten packs index by index — because
 * it is a property of 2,581 rows and not of a rendered screen.
 */
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { PronunciationProvider } from '../audio/PronunciationProvider';
import { VOCABULARY } from '../data/vocabulary';
import { wordCopy } from '../data/wordCopy';
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

const byWord = (word: string) => VOCABULARY.find((entry) => entry.word === word)!;

describe('More about it', () => {
  it('appears on 차, and says the thing the gloss cannot', () => {
    /*
     * 차 is the case the section is for: the gloss says "a car", the word is
     * also tea, and a learner who only has the gloss reads 차를 마셔요 as
     * somebody drinking a car.
     */
    open(byWord('차').id);
    expect(screen.getByRole('heading', { name: 'More about it' })).toBeInTheDocument();
    expect(screen.getByText(/tea/i)).toBeInTheDocument();
  });

  it('is absent from a word whose gloss is the whole story', () => {
    // 사과 is an apple and nothing else. Nothing to add, so nothing is added.
    open(byWord('사과').id);
    expect(screen.getByTestId('detail-headword')).toHaveTextContent('사과');
    expect(screen.queryByRole('heading', { name: 'More about it' })).not.toBeInTheDocument();
  });

  it('is rare, which is what makes it worth reading', () => {
    /*
     * The number is asserted as a band rather than as 25, so authoring a
     * twenty-sixth is not a failing test — but restoring a derived block on
     * hundreds of words is. 784 was the old number and is well outside it.
     */
    const withOne = VOCABULARY.filter((word) => wordCopy(word, 'en').value.definition);
    expect(withOne.length).toBeGreaterThan(0);
    expect(withOne.length).toBeLessThan(VOCABULARY.length / 20);
  });

  it('never repeats the meaning it sits under', () => {
    /*
     * The failure this guards is the one the strict filter on the old derived
     * text could not fix: 좋다 came back as "to be good", under a gloss reading
     * "to be good". A section that restates the line above it is worse than no
     * section, because the learner read it expecting something new.
     */
    for (const word of VOCABULARY) {
      const copy = wordCopy(word, 'en').value;
      if (!copy.definition) continue;
      expect(copy.definition.trim(), word.word).not.toBe(copy.meaning.trim());
      expect(copy.definition.length, word.word).toBeGreaterThan(copy.meaning.length * 2);
    }
  });
});
