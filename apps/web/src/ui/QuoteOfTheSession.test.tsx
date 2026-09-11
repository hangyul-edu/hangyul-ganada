import { cleanup, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LEARNING_QUOTES, QUOTE_LOCALES, renderQuote, resetSessionQuote } from '../data/quotes';
import type * as Quotes from '../data/quotes';
import { LocaleContext, type LocaleContextValue } from '../i18n/LocaleContext';
import { describeLocale } from '../i18n/locales';
import { AVAILABLE_LOCALES } from '../i18n/resources';
import { QuoteOfTheSession } from './QuoteOfTheSession';

/**
 * The two requested quotations, rendered through the real component in every
 * interface language.
 *
 * `data.test.ts` proves the *data* — every locale present, the Korean leading,
 * nothing blank. This proves the *screen*: what a learner in Tamil or Arabic
 * actually sees at the foot of Home is the Korean line, then the translation,
 * then the byline, in that reading order, with the Korean pinned left-to-right
 * and the translation marked with its own language; and a learner in Korean
 * sees the line once.
 */
function withLocale(code: string, ui: React.ReactElement) {
  const descriptor = describeLocale(code);
  const context = {
    locale: code,
    descriptor,
    direction: descriptor.direction,
    source: 'stored',
    available: AVAILABLE_LOCALES.map(describeLocale),
    setLocale: async () => {},
    suggestion: null,
    contentLocale: code,
    contentIsBorrowed: false,
    contentLocales: [],
    setContentLocale: () => {},
  } as unknown as LocaleContextValue;
  return render(<LocaleContext.Provider value={context}>{ui}</LocaleContext.Provider>);
}

const REQUESTED = ['dream-big-pieces', 'carlyle-stepping-stone'] as const;

/** Which quotation the mocked `quoteOnOpen` hands the component. */
const chosen = { id: 'dream-big-pieces' };
vi.mock('../data/quotes', async (importOriginal) => {
  const actual = await importOriginal<typeof Quotes>();
  return {
    ...actual,
    quoteOnOpen: () => actual.LEARNING_QUOTES.find((q) => q.id === chosen.id)!,
  };
});
const show = (id: string) => {
  chosen.id = id;
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  resetSessionQuote();
});

describe('the home-screen quotation card', () => {
  for (const id of REQUESTED) {
    const quote = LEARNING_QUOTES.find((q) => q.id === id)!;

    describe(id, () => {
      it.each(QUOTE_LOCALES.filter((l) => l !== 'ko'))('in %s: Korean first, translation beneath, byline present', (locale) => {
        show(quote.id);
        withLocale(locale, <QuoteOfTheSession />);

        const original = screen.getByTestId('home-quote-original');
        const translation = screen.getByTestId('home-quote-translation');
        const author = screen.getByTestId('home-quote-author');

        expect(original).toHaveTextContent(quote.originalText);
        expect(original).toHaveAttribute('lang', 'ko');
        expect(original).toHaveAttribute('dir', 'ltr');
        // The Korean is the blockquote — the thing being quoted — and leads.
        expect(original.tagName).toBe('BLOCKQUOTE');
        expect(original.compareDocumentPosition(translation) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(translation.compareDocumentPosition(author) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

        expect(translation).toHaveTextContent(quote.translations[locale]!);
        expect(translation).toHaveAttribute('lang', locale);
        expect(translation.textContent).not.toMatch(/[가-힣]/);
        expect(translation.textContent).not.toBe(quote.originalText);
        // The translation is the locale's, not English copied in.
        if (locale !== 'en') expect(translation.textContent).not.toBe(quote.translations.en);

        expect(author).toHaveTextContent(quote.author[locale]!);
        expect(author).toHaveAttribute('data-authorship', quote.authorship === 'unknown' ? 'unknown' : 'named');
        // Nothing on the card is the bare English of another locale's slot.
        expect(screen.queryByTestId('home-quote-text')).toBeNull();
      });

      it('in ko: the Korean once, and the byline', () => {
        show(quote.id);
        withLocale('ko', <QuoteOfTheSession />);
        const text = screen.getByTestId('home-quote-text');
        expect(text).toHaveTextContent(quote.originalText);
        expect(screen.queryByTestId('home-quote-original')).toBeNull();
        expect(screen.queryByTestId('home-quote-translation')).toBeNull();
        expect(screen.getByTestId('home-quote')).toHaveTextContent(quote.author.ko!);
        // The card carries the sentence exactly once.
        const card = screen.getByTestId('home-quote').textContent ?? '';
        expect(card.split(quote.originalText).length - 1).toBe(1);
      });
    });
  }

  it('shows the byline for the unknown-author line as the localized label, never blank', () => {
    const dream = LEARNING_QUOTES.find((q) => q.id === 'dream-big-pieces')!;
    for (const locale of QUOTE_LOCALES) {
      show(dream.id);
      withLocale(locale, <QuoteOfTheSession />);
      const author = screen.getByTestId('home-quote-author');
      expect(author.textContent?.replace(/^—\s*/, '').trim(), locale).toBe(dream.author[locale]);
      expect(author).toHaveAttribute('data-authorship', 'unknown');
      cleanup();
    }
  });

  it('keeps a non-Korean original in the old order: translation first, original beneath', () => {
    const horace = LEARNING_QUOTES.find((q) => q.id === 'horace-half-begun')!;
    show(horace.id);
    withLocale('fr', <QuoteOfTheSession />);
    const text = screen.getByTestId('home-quote-text');
    const original = screen.getByTestId('home-quote-original');
    expect(text).toHaveTextContent(horace.translations.fr!);
    expect(original).toHaveTextContent(horace.originalText);
    expect(text.compareDocumentPosition(original) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('switching locale re-renders both the translation and the byline', () => {
    const carlyle = LEARNING_QUOTES.find((q) => q.id === 'carlyle-stepping-stone')!;
    show(carlyle.id);
    const { rerender } = withLocale('de', <QuoteOfTheSession />);
    expect(screen.getByTestId('home-quote-translation')).toHaveTextContent(carlyle.translations.de!);
    expect(screen.getByTestId('home-quote-author')).toHaveTextContent('Thomas Carlyle');
    const descriptor = describeLocale('ru');
    rerender(
      <LocaleContext.Provider
        value={
          {
            locale: 'ru',
            descriptor,
            direction: descriptor.direction,
            source: 'stored',
            available: [],
            setLocale: async () => {},
            suggestion: null,
            contentLocale: 'ru',
            contentIsBorrowed: false,
            contentLocales: [],
            setContentLocale: () => {},
          } as unknown as LocaleContextValue
        }
      >
        <QuoteOfTheSession />
      </LocaleContext.Provider>,
    );
    expect(screen.getByTestId('home-quote-translation')).toHaveTextContent(carlyle.translations.ru!);
    expect(screen.getByTestId('home-quote-author')).toHaveTextContent('Томас Карлейль');
    // And the Korean original did not move or change.
    expect(screen.getByTestId('home-quote-original')).toHaveTextContent(carlyle.originalText);
  });
});

/**
 * The audit tables and the runtime data are the same facts, or the build
 * fails.
 *
 * `docs/QUOTE_TRANSLATION_AUDIT.md` is the document a reviewer reads; the
 * library is what a learner reads. Each table must carry one row per shipped
 * locale, and the quotation and attribution in each row must be — character
 * for character — what `renderQuote` produces. A table that drifts from the
 * data is a claim about translations nobody is shipping.
 */
describe('the quotation translation audit', () => {
  const audit = readFileSync(join(__dirname, '../../../../docs/QUOTE_TRANSLATION_AUDIT.md'), 'utf8');
  const STATUSES = ['PASS', 'CORRECTED AND PASS', 'NATIVE-SPEAKER REVIEW REQUIRED', 'BLOCKED'];

  function table(heading: string): Map<string, string[]> {
    const start = audit.indexOf(heading);
    expect(start, `${heading} is missing`).toBeGreaterThan(-1);
    const section = audit.slice(start);
    const rows = new Map<string, string[]>();
    for (const line of section.split('\n').slice(1)) {
      if (line.startsWith('## ') || line.startsWith('# ')) break;
      if (!line.startsWith('| `')) continue;
      const cells = line
        .slice(1, -1)
        .split(/(?<!\\)\|/)
        .map((cell) => cell.trim().replace(/\\\|/g, '|'));
      const locale = cells[0]!.replace(/`/g, '');
      rows.set(locale, cells);
    }
    return rows;
  }

  it.each([
    ['dream-big-pieces', '## Table A — Quote 1'],
    ['carlyle-stepping-stone', '## Table B — Quote 2'],
  ])('%s: one row per supported locale, agreeing with the runtime data', (id, heading) => {
    const quote = LEARNING_QUOTES.find((q) => q.id === id)!;
    const rows = table(heading);
    expect([...rows.keys()].sort()).toEqual([...AVAILABLE_LOCALES].sort());
    expect(rows.size).toBe(AVAILABLE_LOCALES.length);
    for (const locale of AVAILABLE_LOCALES) {
      const cells = rows.get(locale)!;
      const rendered = renderQuote(quote, locale);
      // Column 3 is the exact localized quotation, column 4 the exact byline.
      expect(cells[2], `${id} ${locale} quotation`).toBe(rendered.text);
      expect(cells[3], `${id} ${locale} attribution`).toBe(rendered.author);
      const status = cells[14];
      expect(STATUSES, `${id} ${locale} status "${status}"`).toContain(status);
      expect(status).not.toBe('BLOCKED');
      // No cell may be blank or a placeholder.
      for (const [index, cell] of cells.entries()) {
        expect(cell.trim(), `${id} ${locale} column ${index + 1} is blank`).not.toBe('');
        expect(cell, `${id} ${locale} column ${index + 1}`).not.toMatch(/\b(TODO|TBD|UNREVIEWED|FAIL)\b/);
      }
    }
  });

  it('documents the exact supported-locale list and count', () => {
    expect(audit).toContain(`**${AVAILABLE_LOCALES.length}** locales`);
    for (const locale of AVAILABLE_LOCALES) {
      expect(audit, `${locale} is not in the registry section`).toMatch(new RegExp(`\`${locale}\``));
    }
  });
});
