import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { LocaleContext, type LocaleContextValue } from './LocaleContext';
import { LearnerProvider } from '../store/LearnerProvider';
import { PronunciationProvider } from '../audio/PronunciationProvider';
import { MyPage } from '../pages/MyPage';
import { AVAILABLE_LOCALES } from './resources';
import { describeLocale } from './locales';
import { flagFor } from './flags';

/**
 * Every language the app ships has a flag, and the Language row shows it.
 *
 * The row used to lead with a globe — a mark that said "this row is about
 * languages" to a learner who very often already knew that, and said nothing
 * about which one was on. It now leads with the selected language's own flag,
 * from the same `flagFor` the picker uses, so the two marks are one image and
 * cannot drift apart.
 *
 * The requirement that needs a test rather than a look is the *coverage* one:
 * there must be no shipped locale that falls through to the globe. `flagFor`
 * returning `undefined` is a legitimate answer for a tag that is merely stored
 * — a deep link, a browser default — and a silent one for a tag that is
 * offered in the picker, because the fallback renders without complaint. This
 * fails the build instead.
 */
describe('the flag for the selected language', () => {
  it('has one for every locale the app offers', () => {
    const missing = AVAILABLE_LOCALES.filter((code) => !flagFor(code));
    expect(missing, `shipped locales with no flag asset: ${missing.join(', ')}`).toEqual([]);
  });

  it('covers the languages named in the release checks', () => {
    // Korean, English, Simplified Chinese, Japanese, Vietnamese, Thai, Arabic.
    for (const code of ['ko', 'en', 'zh-CN', 'ja', 'vi', 'th', 'ar']) {
      expect(flagFor(code), code).toBeTruthy();
    }
  });

  it('answers for a regional tag through its base language', () => {
    // A stored `en-GB` or `ko-KR` is an ordinary thing to find in a profile.
    expect(flagFor('en-GB')).toBe(flagFor('en'));
    expect(flagFor('ko-KR')).toBe(flagFor('ko'));
    // And a region that decides the image keeps its own answer.
    expect(flagFor('zh-CN')).toBe(flagFor('zh'));
  });

  it('gives every offered language a name in its own script beside the flag', () => {
    // The flag is the mark; the endonym is the label. Neither replaces the
    // other, and a row with a flag and no name would be unreadable to exactly
    // the learner this row exists for.
    for (const code of AVAILABLE_LOCALES) {
      expect(describeLocale(code).nativeName, code).toBeTruthy();
    }
  });

  /*
   * And the row itself, in the language a learner most often has it in.
   *
   * Rendered rather than reasoned about: the coverage assertions above prove
   * `flagFor` has an answer, and this proves the answer reaches the screen —
   * the two are different failures and the first one passing while the second
   * one is broken is exactly the shape of a green suite over a visibly wrong
   * screen.
   */
  it.each(['ko', 'en', 'zh-CN', 'ja', 'vi', 'th', 'ar'])(
    'renders the flag rather than the globe with %s selected',
    async (code) => {
      const context = {
        locale: code,
        descriptor: describeLocale(code),
        direction: describeLocale(code).direction,
        source: 'stored',
        available: AVAILABLE_LOCALES,
        setLocale: async () => {},
        suggestion: null,
      } as unknown as LocaleContextValue;

      render(
        <MemoryRouter>
          <LocaleContext.Provider value={context}>
            <LearnerProvider>
              <PronunciationProvider voice="female">
                <MyPage />
              </PronunciationProvider>
            </LearnerProvider>
          </LocaleContext.Provider>
        </MemoryRouter>,
      );

      const flag = await screen.findByTestId('settings-language-flag');
      expect(flag).toHaveAttribute('src', flagFor(code));
      // Decorative: the row is already named by its label and the endonym.
      expect(flag).toHaveAttribute('alt', '');
    },
  );
});
