/**
 * Every prohibited category, in every shipped language, in every evasion the
 * normaliser is meant to see through — generated from the policy itself
 * rather than hand-listed, so a concept that gains a language or a language
 * that gains a concept is tested the moment it is written.
 *
 * `fixtures.test.ts` holds the hand-written cases (355 of them, twelve
 * languages). This is the systematic sweep behind them: the first surface of
 * every concept in each of the 32 interface languages, as a random option —
 * the role where a HARD_BLOCK and a CONTEXT_BLOCK both refuse — must block;
 * and every Korean surface must still block with zero-width joiners between
 * its syllables, with a particle attached, and inside a sentence.
 */
import { describe, expect, it } from 'vitest';

import { evaluateSurface, POLICY, verdictOf } from './index';

const LOCALES = [
  'ko', 'en', 'de', 'fr', 'es', 'pt-BR', 'it', 'nl', 'sv', 'pl', 'cs', 'hu', 'ro', 'el', 'tr',
  'ru', 'uk', 'kk', 'ky', 'uz', 'mn', 'ar', 'hi', 'bn', 'ta', 'te', 'th', 'vi', 'id', 'fil', 'ja', 'zh-CN',
];
const CATEGORIES = ['sexual', 'profanity', 'drugs', 'gambling', 'violence', 'self_harm', 'political'];

type Concept = { id: string; category: string; surfaces: Record<string, string[]>; match?: Record<string, Record<string, string>> };
const concepts = (POLICY as unknown as { concepts: Concept[] }).concepts;

const blocks = (text: string, lang: string) => {
  const facts = { random: true };
  return verdictOf(evaluateSurface({ text, lang, role: 'option' }, facts), facts);
};

describe('every prohibited category has a surface in every shipped language', () => {
  for (const category of CATEGORIES) {
    for (const lang of LOCALES) {
      const surface = concepts
        .filter((c) => c.category === category)
        .flatMap((c) => c.surfaces[lang] ?? c.surfaces['*'] ?? [])
        .find((s) => s && !s.includes('*'));
      it(`${category} / ${lang}`, () => {
        expect(surface, `no ${category} surface for ${lang}`).toBeTruthy();
        expect(blocks(surface!, lang)).toBe('blocked');
      });
    }
  }
});

describe('Korean surfaces survive the evasions a learner-facing string can carry', () => {
  const korean = concepts.flatMap((c) =>
    (c.surfaces.ko ?? [])
      .filter((s) => /^[가-힣]{2,}$/.test(s))
      .slice(0, 2)
      .map((s) => [c.id, s, c.match?.ko?.[s] ?? 'substring'] as const),
  );
  expect(korean.length).toBeGreaterThan(8);
  for (const [id, term, mode] of korean) {
    it(`${id}: ${term} (${mode}) zero-width, spaced, with a particle, in a sentence`, () => {
      expect(blocks(term, 'ko'), 'plain').toBe('blocked');
      expect(blocks([...term].join('\u200b'), 'ko'), 'zero-width').toBe('blocked');
      /*
       * A surface matched as a whole token — 자해, because 각자 해요 contains it —
       * is deliberately not matched across a space: "자 해" is two words. The
       * substring-mode surfaces (섹스, 살인, 자살) are joined back and refused.
       */
      if (mode === 'substring') expect(blocks([...term].join(' '), 'ko'), 'spaced').toBe('blocked');
      expect(blocks(`${term}를 했어요.`, 'ko'), 'particle + sentence').toBe('blocked');
      expect(blocks(`오늘은 ${term}!`, 'ko'), 'punctuated').toBe('blocked');
    });
  }
});

describe('the everyday words a substring filter would take with them stay askable', () => {
  // 성공 (success) contains 성; 사살 is not 살다; 마약 is not 약 (medicine).
  for (const [text, lang] of [['성공하다', 'ko'], ['약을 먹어요', 'ko'], ['살다', 'ko'], ['총 세 개', 'ko'], ['assessment', 'en'], ['Essex', 'en'], ['shot of espresso', 'en']] as const) {
    it(`${text} (${lang}) is not refused`, () => {
      expect(blocks(text, lang)).toBe('ok');
    });
  }
});
