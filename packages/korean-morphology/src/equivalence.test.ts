import { describe, expect, it } from 'vitest';

import { compare, normalise, sameLemma } from './equivalence';

describe('answer equivalence', () => {
  it('trims, collapses and drops terminal punctuation', () => {
    expect(normalise('  학교에   가요.  ')).toBe('학교에 가요');
    expect(normalise('몇 시예요?')).toBe('몇 시예요');
  });

  it('calls two spellings of one phrase the same answer, and says it was the spacing', () => {
    const result = compare('한 개', '한개');
    expect(result.difference).toBe('spacing');
    expect(result.same).toBe(true);
  });

  it('accepts the wrong alternant of the right particle', () => {
    // 학교 ends in a vowel, so 를 is correct and 을 is the other alternant of
    // the same particle — the learner chose the right particle.
    const result = compare('학교를', '학교을');
    expect(result.difference).toBe('particle');
    expect(result.same).toBe(true);
    expect(compare('책을', '책를').difference).toBe('particle');
    expect(compare('저는', '저은').difference).toBe('particle');
  });

  it('does not confuse two different particles', () => {
    // 을 and 에 are different particles, not two shapes of one.
    expect(compare('학교를', '학교에').difference).toBe('different');
  });

  it('names the plain numeral written where a counting form belongs', () => {
    const result = compare('하나 개', '한 개');
    expect(result.difference).toBe('countingForm');
    // The right words in the wrong shape is not the same answer: the course
    // teaches exactly this distinction.
    expect(result.same).toBe(false);
    expect(compare('둘 잔', '두 잔').difference).toBe('countingForm');
    expect(compare('스물 살', '스무 살').difference).toBe('countingForm');
  });

  it('separates a politeness level from a different thing to say', () => {
    expect(compare('가요', '갑니다', '가다').difference).toBe('politeness');
    expect(compare('가요', '갔어요', '가다').difference).toBe('inflection');
    // Neither is accepted: both are answers to a different question.
    expect(compare('가요', '갑니다', '가다').same).toBe(false);
  });

  it('handles an irregular stem through the conjugation tables', () => {
    // ㄷ irregular: 듣다 → 들어요, and the formal 듣습니다 keeps the ㄷ.
    expect(compare('들어요', '듣습니다', '듣다').difference).toBe('politeness');
    expect(sameLemma('들어요', '듣습니다', '듣다')).toBe(true);
    expect(sameLemma('들어요', '먹어요', '듣다')).toBe(false);
  });

  it('is symmetric and deterministic', () => {
    const pairs: Array<[string, string, string | undefined]> = [
      ['한 개', '한개', undefined],
      ['학교를', '학교을', undefined],
      ['하나 개', '한 개', undefined],
      ['가요', '갑니다', '가다'],
      ['개', '마리', undefined],
    ];
    for (const [a, b, lemma] of pairs) {
      const forward = compare(a, b, lemma);
      const backward = compare(b, a, lemma);
      expect(backward.difference, `${a} / ${b}`).toBe(forward.difference);
      expect(compare(a, b, lemma).difference).toBe(forward.difference);
    }
  });

  it('compares decomposed Korean as the reader sees it', () => {
    /*
     * A text field on iOS or macOS, a clipboard round trip and any NFD pass
     * hand back 학교를 as six conjoining jamo. Every rule in this module is
     * written against precomposed syllables — `endsWith('를')` is a
     * one-character test — so without the composition in `normalise` the
     * particle rule never fires and two identical-looking strings come back
     * `different`.
     */
    const decomposed = (text: string) => text.normalize('NFD');
    expect(decomposed('학교를')).not.toBe('학교를');
    expect(compare(decomposed('학교를'), '학교를').difference).toBe('identical');
    expect(compare(decomposed('학교를'), '학교을').difference).toBe('particle');
    expect(compare(decomposed('한 개'), '한개').difference).toBe('spacing');
    expect(compare(decomposed('가요'), '갑니다', '가다').difference).toBe('politeness');
    expect(compare('가요', decomposed('갑니다'), decomposed('가다')).difference).toBe('politeness');
    expect(sameLemma(decomposed('들어요'), '듣습니다', '듣다')).toBe(true);
    // And it stays a decision about the strings: composition does not make two
    // different words the same one.
    expect(compare(decomposed('개'), '마리').difference).toBe('different');
  });

  it('relates nothing it cannot account for', () => {
    expect(compare('개', '마리').difference).toBe('different');
    expect(compare('개', '마리').same).toBe(false);
  });
});
