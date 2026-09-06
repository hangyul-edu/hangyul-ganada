import { describe, expect, it } from 'vitest';

import { validate } from './validate';

describe('typed answer validation', () => {
  it('accepts the answer as written', () => {
    expect(validate('학교에 가요', '학교에 가요')).toEqual({
      accepted: true,
      tolerated: 'identical',
    });
  });

  it('reports nothing typed and text that is not Korean', () => {
    expect(validate('   ', '한 개')).toEqual({ accepted: false, error: 'empty' });
    expect(validate('hakgyo', '학교')).toEqual({ accepted: false, error: 'notKorean' });
    // A translation is not a wrong Korean answer; it is not an answer.
    expect(validate('school', '학교').accepted).toBe(false);
  });

  it('accepts a spacing slip, and rejects it in a question about spacing', () => {
    expect(validate('한개', '한 개')).toEqual({ accepted: true, tolerated: 'spacing' });
    expect(validate('한개', '한 개', { spacingIsTheAnswer: true })).toEqual({
      accepted: false,
      error: 'spacing',
    });
  });

  it('accepts the wrong alternant of the right particle, and says which', () => {
    const result = validate('학교을', '학교를');
    expect(result.accepted).toBe(true);
    expect(result.facts).toEqual({
      typedParticle: '을',
      expectedParticle: '를',
      stem: '학교',
      // 교 has no 받침, which is the reason 를 is the right alternant.
      stemEndsInConsonant: false,
    });
  });

  it('rejects the alternant where the rule is the lesson', () => {
    const result = validate('책를', '책을', { particleIsTheAnswer: true });
    expect(result).toMatchObject({ accepted: false, error: 'particle' });
    expect(result.facts).toMatchObject({ stem: '책', stemEndsInConsonant: true });
  });

  it('separates a wrong particle from a wrong word', () => {
    // Two different particles on the same stem: one keystroke and a taught rule.
    const particle = validate('학교에', '학교를');
    expect(particle).toMatchObject({ accepted: false, error: 'particle' });
    expect(particle.facts).toMatchObject({ typedParticle: '에', expectedParticle: '를' });
    // A different word is a different lesson.
    expect(validate('마리', '개')).toEqual({ accepted: false, error: 'different' });
  });

  it('names the numeral when a counting form was wanted', () => {
    const result = validate('하나 개', '한 개');
    expect(result).toMatchObject({ accepted: false, error: 'countingForm' });
    expect(result.facts).toEqual({ plainNumeral: '하나', countingForm: '한' });
  });

  it('names both forms for a politeness level and for an inflection', () => {
    const politeness = validate('갑니다', '가요', { lemma: '가다' });
    expect(politeness).toMatchObject({ accepted: false, error: 'politeness' });
    expect(politeness.facts).toEqual({ typedForm: 'formalPolite', expectedForm: 'presentPolite' });

    const inflection = validate('갔어요', '가요', { lemma: '가다' });
    expect(inflection).toMatchObject({ accepted: false, error: 'inflection' });
    expect(inflection.facts).toEqual({ typedForm: 'pastPolite', expectedForm: 'presentPolite' });
  });

  it('resolves an irregular stem through the conjugation tables', () => {
    // ㄷ irregular: 듣다 → 들어요, and the formal 듣습니다 keeps the ㄷ.
    const result = validate('듣습니다', '들어요', { lemma: '듣다' });
    expect(result).toMatchObject({ accepted: false, error: 'politeness' });
    expect(result.facts).toMatchObject({ typedForm: 'formalPolite' });
  });

  it('grades decomposed Hangul as the reader sees it', () => {
    // A macOS or iOS text field hands back conjoining jamo; every rule below
    // `normalise` is written against precomposed syllables.
    const decomposed = (text: string) => text.normalize('NFD');
    expect(decomposed('학교를')).not.toBe('학교를');
    expect(validate(decomposed('학교를'), '학교를')).toEqual({
      accepted: true,
      tolerated: 'identical',
    });
    expect(validate(decomposed('학교을'), '학교를').accepted).toBe(true);
    expect(validate(decomposed('갑니다'), '가요', { lemma: '가다' })).toMatchObject({
      error: 'politeness',
    });
  });

  it('is deterministic and never throws on odd input', () => {
    for (const [typed, expected] of [
      ['', ''],
      ['?', '한 개'],
      ['한 개.', '한 개'],
      ['ㄱ', '가'],
      ['가나다라마바사', '가'],
    ] as const) {
      const first = validate(typed, expected);
      expect(validate(typed, expected)).toEqual(first);
    }
    // Terminal punctuation is normalised away, so this is the same answer.
    expect(validate('한 개.', '한 개')).toEqual({ accepted: true, tolerated: 'identical' });
  });
});
