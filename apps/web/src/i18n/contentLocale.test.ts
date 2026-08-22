import { describe, expect, it } from 'vitest';

import { contentLocale, isBorrowedContent } from './contentLocale';

/** The ten the curriculum actually ships meanings in. */
const AVAILABLE = ['en', 'ko', 'ja', 'zh-CN', 'es', 'fr', 'de', 'pt-BR', 'th', 'vi'];

describe('which language a word means something in', () => {
  it('uses the interface language when the corpus has it', () => {
    for (const locale of AVAILABLE) {
      expect(contentLocale(locale, AVAILABLE)).toBe(locale);
    }
  });

  it('never returns a language the corpus does not have', () => {
    // The whole failure mode was a screen asking for meanings in a language
    // that has none and getting English *without saying so*. Whatever this
    // returns, a pack for it exists.
    for (const locale of ['ta', 'hi', 'te', 'bn', 'ar', 'uz', 'kk', 'mn', 'ky', 'fil']) {
      expect(AVAILABLE).toContain(contentLocale(locale, AVAILABLE));
    }
  });

  it('honours an explicit choice over any guess', () => {
    // A Tamil learner who reads Japanese should get Japanese, not English.
    expect(contentLocale('ta', AVAILABLE, 'ja')).toBe('ja');
    expect(contentLocale('hi', AVAILABLE, 'ko')).toBe('ko');
  });

  it('ignores a choice the corpus cannot honour', () => {
    // Choosing Telugu when there are no Telugu meanings is not a thing the app
    // can do, and pretending otherwise would put the learner back in front of
    // silent English with a setting that claims otherwise.
    expect(contentLocale('ta', AVAILABLE, 'te')).toBe('en');
  });

  it('prefers the interface language over a stale choice', () => {
    // Someone who chose Japanese meanings while reading Tamil, then switched
    // the interface to Japanese-adjacent Korean, reads Korean: their own
    // language outranks a preference set for a language they have left.
    expect(contentLocale('ko', AVAILABLE, 'ja')).toBe('ko');
  });

  it('walks the fallback chain before giving up on the reader', () => {
    // pt has no pack; pt-BR does, and it is a language a pt reader reads.
    expect(contentLocale('pt', AVAILABLE)).toBe('pt-BR');
    expect(contentLocale('zh', AVAILABLE)).toBe('zh-CN');
  });

  it('ends at English, which every corpus has', () => {
    expect(contentLocale('ta', AVAILABLE)).toBe('en');
    expect(contentLocale('ta', ['en'])).toBe('en');
  });

  it('says when the meanings are in a borrowed language', () => {
    expect(isBorrowedContent('ta', contentLocale('ta', AVAILABLE))).toBe(true);
    expect(isBorrowedContent('ja', contentLocale('ja', AVAILABLE))).toBe(false);
    // Borrowed is about the *reader*, not about English: a Tamil learner
    // reading Japanese meanings is being shown a second language too.
    expect(isBorrowedContent('ta', contentLocale('ta', AVAILABLE, 'ja'))).toBe(true);
  });
});
