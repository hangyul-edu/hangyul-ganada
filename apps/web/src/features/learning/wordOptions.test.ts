import { describe, expect, it } from 'vitest';

import en from '../../data/generated/vocabulary.en.json';
import built from '../../data/generated/vocabulary.json';
import { VOCABULARY } from '../../data/vocabulary';
import { readingOptions } from './wordOptions';

/**
 * Glosses that mean the same thing are never offered against each other.
 *
 * The pairs below were read off the exercise inventory of 2026-09-16, where
 * each was a shipped reading question with two right answers: 잠깐 ("a
 * moment") beside 잠시 ("a moment, short time"), 사용하다 ("to use") beside
 * 이용하다 ("to make use of"). They are held as fixtures rather than derived
 * from the rule that now excludes them, so a change to that rule that lets
 * one back in fails here on the pair itself.
 */
const positionOf = new Map((built as { words: Array<{ id: string }> }).words.map((word, index) => [word.id, index]));
const meaningOf = (word: { id: string }) => (en as unknown as { words: Array<Array<string | null>> }).words[positionOf.get(word.id)!]?.[0] ?? '';
const byKorean = new Map(VOCABULARY.map((word) => [word.word, word]));

const SYNONYM_PAIRS: Array<[string, string]> = [
  ['잠깐', '잠시'],
  ['사용하다', '이용하다'],
  ['좋아지다', '나아지다'],
  ['최소한', '적어도'],
  ['간신히', '겨우'],
  ['요새', '요즘'],
  ['세상', '세계'],
  ['물러나다', '물러서다'],
  ['참가하다', '참여하다'],
  ['허가', '허락'],
  ['우려', '염려'],
  ['모으다', '모이다'],
  ['적당하다', '적합하다'],
  ['부인하다', '부정하다'],
  ['요구하다', '요청하다'],
  ['화내다', '화나다'],
  ['승용차', '차'],
  ['보고하다', '신고하다'],
  ['수사하다', '조사하다'],
  ['여성', '여자'],
];

/** Pairs that only share a head word and must stay available as look-alike distractors. */
const DISTINCT_PAIRS: Array<[string, string]> = [
  ['여기', '거기'],
  ['남자', '여자'],
  ['지난주', '지난달'],
  ['노란색', '파란색'],
  ['오르다', '들어가다'],
];

describe('reading options and near-synonyms', () => {
  it('never offers a gloss that reads as the answer, in either direction', () => {
    for (const [a, b] of SYNONYM_PAIRS) {
      const wordA = byKorean.get(a);
      const wordB = byKorean.get(b);
      expect(wordA, a).toBeDefined();
      expect(wordB, b).toBeDefined();
      for (let seed = 0; seed < 8; seed += 1) {
        const offeredAgainstA = readingOptions(wordA!, seed, meaningOf).map((option) => option.word);
        expect(offeredAgainstA, `${a} (${meaningOf(wordA!)}) offered ${b} (${meaningOf(wordB!)})`).not.toContain(b);
        const offeredAgainstB = readingOptions(wordB!, seed, meaningOf).map((option) => option.word);
        expect(offeredAgainstB, `${b} offered ${a}`).not.toContain(a);
      }
    }
  });

  it('still fills every question with four options', () => {
    for (const [a, b] of [...SYNONYM_PAIRS, ...DISTINCT_PAIRS]) {
      for (const korean of [a, b]) {
        const word = byKorean.get(korean)!;
        expect(readingOptions(word, 1, meaningOf)).toHaveLength(4);
      }
    }
  });

  it('keeps distinct look-alikes available', () => {
    // Not "is always offered" — the pool is ordered and only three are drawn —
    // but the rule must not have excluded them: 여기 offered 거기 before this
    // change and there is no reason for it to stop.
    for (const [a, b] of DISTINCT_PAIRS) {
      const wordA = byKorean.get(a)!;
      const wordB = byKorean.get(b)!;
      const pool = VOCABULARY.filter(
        (other) =>
          other.part_of_speech === wordA.part_of_speech &&
          Math.abs(other.difficulty_level - wordA.difficulty_level) <= 2,
      );
      if (!pool.includes(wordB)) continue;
      const seen = new Set<string>();
      for (let seed = 0; seed < 40; seed += 1) {
        for (const option of readingOptions(wordA, seed, meaningOf)) seen.add(option.word);
      }
      // The draw is in pool order, so the look-alike sits at the front of it.
      expect([...seen].length).toBeGreaterThan(1);
    }
  });
});
