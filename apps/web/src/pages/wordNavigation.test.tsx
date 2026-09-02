/**
 * Tapping a word opens the word.
 *
 * Browsing a category used to be a dead end: the cards showed a headword and a
 * gloss, the only control on them was Save, and there was no way to ask *what
 * is this word* about any of the two and a half thousand entries behind them. A
 * dictionary you cannot open is a list.
 *
 * The other half of that is the one an implementation gets wrong: making the
 * card tappable must not make **Save** tappable-into-a-navigation. A learner
 * working down a category and bookmarking as they go would be thrown out of the
 * list on a mis-tap, which is worse than the missing feature was.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { LocaleContext, type LocaleContextValue } from '../i18n/LocaleContext';
import { LearnerProvider } from '../store/LearnerProvider';
import { VOCABULARY, wordsByCategory } from '../data/vocabulary';
import { WordCategoryPage } from './WordsPage';

/** Enough of the locale layer for `wordCopy` to resolve. English, as it ships. */
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

/** Stands in for the real detail screen: all this asserts is which word arrived. */
function DetailStub() {
  return <p data-testid="detail">{useParams().wordId}</p>;
}

function browse(category: string) {
  return render(
    <LearnerProvider>
      <LocaleContext.Provider value={locale}>
        <MemoryRouter initialEntries={[`/words/category/${category}`]}>
          <Routes>
            <Route path="/words/category/:category" element={<WordCategoryPage category={category} />} />
            <Route path="/words/word/:wordId" element={<DetailStub />} />
          </Routes>
        </MemoryRouter>
      </LocaleContext.Provider>
    </LearnerProvider>,
  );
}

/** The category the brief's examples live in — 여자, 사람, 엄마, 친구, 아빠. */
const FAMILY = VOCABULARY.find((word) => word.word === '엄마')!.category;

describe('a word card in a category', () => {
  it.each(['여자', '사람', '엄마', '친구', '아빠', '남자', '아버지', '아이'])(
    'opens %s',
    async (headword) => {
      const user = userEvent.setup();
      const word = wordsByCategory(FAMILY).find((row) => row.word === headword)!;
      expect(word, `${headword} is not in ${FAMILY}`).toBeDefined();

      const { container } = browse(FAMILY);
      // By destination rather than by accessible name: the name includes the
      // gloss, and several of these words appear in each other's glosses.
      const link = container.querySelector<HTMLAnchorElement>(
        `a[href="/words/word/${word.id}"]`,
      );
      expect(link, `no card links to ${headword}`).not.toBeNull();
      expect(link!.textContent).toContain(headword);

      await user.click(link!);
      expect(screen.getByTestId('detail')).toHaveTextContent(word.id);
    },
  );

  it('is reached by the keyboard as well as by a tap', async () => {
    const user = userEvent.setup();
    browse(FAMILY);

    const first = screen.getAllByRole('link')[0]!;
    first.focus();
    await user.keyboard('{Enter}');

    expect(screen.getByTestId('detail')).toBeInTheDocument();
  });
});

describe('Save is its own action', () => {
  it('saves without opening the word, and un-saves without opening it either', async () => {
    const user = userEvent.setup();
    browse(FAMILY);

    /*
     * The first *toggle* on the screen, not the first button on it.
     *
     * This read `getAllByRole('button')[0]` and passed for as long as the save
     * star happened to be the first button in the document. It stopped being
     * one the day every screen gained a back chevron in its header, and what
     * the test then asserted was that the *back button* reports `aria-pressed`
     * — which it does not, so the failure named the right symptom and the
     * wrong cause. An index into every button on a page is a claim about the
     * page's whole layout smuggled into a test about one control.
     *
     * `aria-pressed` is what makes this control a toggle, so it is also the
     * honest way to find it: no other control on this screen has one.
     */
    const save = () => screen.getAllByRole('button').find((button) => button.hasAttribute('aria-pressed'))!;

    expect(save()).toHaveAttribute('aria-pressed', 'false');

    await user.click(save());
    expect(screen.queryByTestId('detail')).not.toBeInTheDocument();
    expect(save()).toHaveAttribute('aria-pressed', 'true');

    await user.click(save());
    expect(screen.queryByTestId('detail')).not.toBeInTheDocument();
    expect(save()).toHaveAttribute('aria-pressed', 'false');
  });

  it('is not nested inside the link, so there is nothing to stop propagating', () => {
    /*
     * The arrangement, not the workaround. A button inside a link is invalid
     * HTML, warns in React, and behaves differently across browsers and screen
     * readers; `stopPropagation` papers over it and leaves the nesting there.
     * Two siblings cannot navigate each other by accident.
     */
    browse(FAMILY);
    for (const link of screen.getAllByRole('link')) {
      expect(link.querySelector('button')).toBeNull();
    }
    for (const button of screen.getAllByRole('button')) {
      expect(button.closest('a')).toBeNull();
    }
  });
});
