/**
 * The Korean particle chooser.
 *
 * Every case here was in the shipped app as "은(는)" or as a hard-coded
 * particle that is wrong half the time — 마디를 rendered as 마디을, 사과가 as
 * 사과이. A learner of Korean is exactly the reader who notices.
 */
import { describe, expect, it } from 'vitest';

import { createI18n } from './config';
import { endsInConsonant, withParticle } from './josa';

describe('particles', () => {
  it('agrees with a word that ends in a vowel', () => {
    expect(withParticle('마디', '은/는')).toBe('마디는');
    expect(withParticle('사과', '이/가')).toBe('사과가');
    expect(withParticle('사과', '을/를')).toBe('사과를');
    expect(withParticle('의자', '이에요/예요')).toBe('의자예요');
  });

  it('agrees with a word that ends in a consonant', () => {
    expect(withParticle('사람', '은/는')).toBe('사람은');
    expect(withParticle('물', '이/가')).toBe('물이');
    expect(withParticle('책', '을/를')).toBe('책을');
    expect(withParticle('학생', '이에요/예요')).toBe('학생이에요');
  });

  it('reads a letter by its name, not by its codepoint', () => {
    // ㄱ is 기역 — consonant-final, so 이에요. ㅏ is 아 — so 예요. Reading the
    // jamo itself would get every consonant in the alphabet wrong.
    expect(withParticle('ㄱ', '이에요/예요')).toBe('ㄱ이에요');
    expect(withParticle('ㅏ', '이에요/예요')).toBe('ㅏ예요');
    expect(withParticle('ㅎ', '은/는')).toBe('ㅎ은');
    expect(withParticle('ㅗ', '은/는')).toBe('ㅗ는');
  });

  it('knows that ㄹ takes the vowel form of 으로', () => {
    expect(withParticle('서울', '으로/로')).toBe('서울로');
    expect(withParticle('학교', '으로/로')).toBe('학교로');
    expect(withParticle('집', '으로/로')).toBe('집으로');
  });

  it('falls back to the both-forms spelling only when it cannot know', () => {
    expect(endsInConsonant('OK')).toBeNull();
    expect(withParticle('OK', '은/는')).toBe('OK은(는)');
  });

  it('is wired into the Korean bundle', () => {
    const i18n = createI18n('ko');
    // A key that actually ships. This used to point at the word-reading step's
    // copy, which went with the step: vocabulary is no longer read back in a
    // lesson of its own. The particle is still live — it is what the Review
    // screen writes under a wrong answer — and that is the key to hold.
    expect(i18n.t('learning:review.answerIs', { word: '마디', meaning: 'joint' })).toContain(
      '마디는',
    );
    expect(i18n.t('learning:review.answerIs', { word: '사람', meaning: 'person' })).toContain(
      '사람은',
    );
    expect(i18n.t('learning:recognition.correctDetail', { character: 'ㄱ' })).toBe('맞아요, ㄱ이에요.');
    expect(i18n.t('learning:recognition.correctDetail', { character: 'ㅏ' })).toBe('맞아요, ㅏ예요.');
  });

  it('leaves every other language alone', () => {
    const i18n = createI18n('en');
    expect(i18n.t('learning:review.answerIs', { word: '마디', meaning: 'joint' })).toBe(
      '마디 means “joint”.',
    );
  });
});
