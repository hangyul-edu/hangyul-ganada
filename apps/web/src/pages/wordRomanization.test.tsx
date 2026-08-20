/**
 * What a learner reads under the headword.
 *
 * This screen printed IPA for the whole life of the product — `자리 [tɕa.ɾi]` —
 * and it was the wrong notation for the person it was shown to. Somebody three
 * days into Hangul cannot read ɕ; the one line on the card whose job is *help
 * me say this* was a line they skipped past, and the ones who did try to sound
 * it out did worse than *jari* would have let them.
 *
 * So: official Revised Romanisation, no brackets, and the recording still one
 * tap away as the thing that actually teaches the sound.
 *
 * The data side of this is checked by `npm run romanization:qa`, which
 * re-derives all 2,581 romanisations through the rules and fails on an IPA
 * symbol anywhere in the pack. What that cannot see is the *screen*: a correct
 * value and a component that still calls the old transcriber renders the old
 * notation and passes every data check. That is what these render.
 */
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { PronunciationProvider } from '../audio/PronunciationProvider';
import { VOCABULARY } from '../data/vocabulary';
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

const byWord = (word: string) => {
  const found = VOCABULARY.find((entry) => entry.word === word);
  if (!found) throw new Error(`${word} is not in the corpus — the fixture needs updating`);
  return found;
};

/**
 * Every IPA symbol the old transcription used.
 *
 * Listed rather than matched as "any non-ASCII", so that a failure reads as
 * *the IPA came back* instead of as an encoding complaint — and so the test
 * still passes on a Korean or Thai interface, where non-ASCII is the norm.
 *
 * The two combining marks are alternated rather than put in the class: ͈ and ̚
 * combine with whatever precedes them, and a character class containing a
 * combining mark matches things nobody meant it to.
 */
const IPA = /[ɕɾʌɯŋɸʑʰː]|\u0348|\u031A/u;

describe('the reading aid under the headword', () => {
  it('is the Revised Romanisation, in Roman letters', () => {
    open(byWord('자리').id);
    expect(screen.getByTestId('detail-romanization')).toHaveTextContent(/^jari$/);
  });

  it('is labelled as a romanisation, not as a pronunciation guide', () => {
    open(byWord('자리').id);
    expect(screen.getByText('Romanisation')).toBeInTheDocument();
  });

  it('is not wrapped in brackets', () => {
    open(byWord('자리').id);
    expect(screen.getByTestId('detail-romanization').textContent).not.toMatch(/[[\]/]/);
  });

  it('shows no IPA anywhere on the screen', () => {
    const { container } = open(byWord('자리').id);
    expect(container.textContent ?? '').not.toMatch(IPA);
    // The old markup announced itself: `lang="ko-Latn-fonipa"`.
    expect(container.querySelector('[lang*="fonipa"]')).toBeNull();
  });

  it('follows the standard pronunciation rather than the spelling', () => {
    // 좋다 is written with ㅎ + ㄷ and said 조타. A romanisation built from the
    // letters would read *johda*, which is a pronunciation nobody uses.
    open(byWord('좋다').id);
    expect(screen.getByTestId('detail-romanization')).toHaveTextContent(/^jota$/);
  });

  it('does not write the tensing the standard says not to write', () => {
    // 학교 is said [학꾜]. §3-1 of 국어의 로마자 표기법 says sound-change
    // tensing is not reflected in the spelling, so it is *hakgyo*.
    open(byWord('학교').id);
    expect(screen.getByTestId('detail-romanization')).toHaveTextContent(/^hakgyo$/);
  });

  it('still offers the recording, which is what teaches the sound', () => {
    open(byWord('자리').id);
    expect(screen.getAllByRole('button', { name: /자리/ }).length).toBeGreaterThan(0);
  });
});

describe('the corpus behind it', () => {
  it('gives every word a romanisation in plain Roman letters', () => {
    const broken = VOCABULARY.filter(
      (word) => !word.romanization || !/^[a-z]+(?:[ -][a-z]+)*$/.test(word.romanization),
    );
    expect(broken.map((word) => `${word.word}: ${word.romanization}`)).toEqual([]);
  });

  it('has no IPA left in it', () => {
    const offenders = VOCABULARY.filter((word) => IPA.test(word.romanization));
    expect(offenders.map((word) => word.word)).toEqual([]);
  });
});
