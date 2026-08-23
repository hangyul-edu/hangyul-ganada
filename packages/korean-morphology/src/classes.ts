/**
 * Which conjugation class a stem belongs to.
 *
 * ## Why this cannot be done by spelling alone
 *
 * Korean's irregular classes are defined by the *stem*, not by the letter it
 * ends in, and the spelling gives no clue which is which:
 *
 * | | Irregular | Regular |
 * | --- | --- | --- |
 * | ㄷ | 걷다 → 걸어요 | 닫다 → 닫아요 |
 * | ㅂ | 돕다 → 도와요 | 잡다 → 잡아요 |
 * | ㅅ | 낫다 → 나아요 | 웃다 → 웃어요 |
 * | ㅎ | 그렇다 → 그래요 | 좋다 → 좋아요 |
 *
 * So membership has to be listed. What is listed here is every stem in this
 * product's teaching corpus plus the common ones a learner will look up, and
 * `conjugation.test.ts` walks the whole corpus and requires every verb and
 * adjective in it to be classified deliberately rather than by falling through
 * to "regular".
 *
 * ## Why a list rather than a dictionary lookup
 *
 * Because the classes are closed. Korean has not gained an irregular verb in
 * centuries; the productive part is the *suffixes* — anything ending in -답다,
 * -롭다 or -스럽다 is ㅂ-irregular by construction, and those are handled by
 * rule below rather than by enumeration.
 *
 * ## Homographs
 *
 * Three stems are two verbs with the same spelling and different classes:
 * 걷다 (walk, irregular / roll up, regular), 묻다 (ask, irregular / bury,
 * regular) and 굽다 (bake, irregular / bend, regular). The corpus teaches the
 * first of each, so the first of each is what is listed — and `classify` takes
 * an optional hint so a caller who knows the sense can override it.
 */

import { decompose, FINALS, isHangulSyllable } from './hangul';

export type ConjugationClass =
  | 'regular'
  /** 하다 and every X하다 compound: 하 + 아 → 해. */
  | 'hada'
  /** ㅡ drops before a vowel: 쓰 + 어 → 써, 예쁘 + 어 → 예뻐. */
  | 'eu'
  /** 르 doubles its ㄹ: 모르 + 아 → 몰라. */
  | 'reu'
  /** 르 takes 러: 푸르 + 어 → 푸르러. Three stems in the language. */
  | 'reo'
  /** ㄷ becomes ㄹ before a vowel: 듣 + 어 → 들어. */
  | 'd'
  /** ㅂ becomes 우/오: 춥 + 어 → 추워, 돕 + 아 → 도와. */
  | 'b'
  /** ㅅ drops before a vowel and nothing contracts: 낫 + 아 → 나아. */
  | 's'
  /** ㅎ drops and the vowel fronts: 그렇 + 어 → 그래. Adjectives only. */
  | 'h'
  /** ㄹ drops before ㄴ, ㅂ, ㅅ and 오: 살 + ㅂ니다 → 삽니다. */
  | 'l'
  /** 있다, 없다, 이다 — suppletive enough to be worth their own branch. */
  | 'irregularStem';

/** ㄷ → ㄹ. Everything else ending in ㄷ is regular. */
export const D_IRREGULAR = new Set([
  '걷', // walk. 걷다 "roll up" is regular; see the note above.
  '깨닫',
  '듣',
  '묻', // ask. 묻다 "bury" is regular.
  '싣',
  '알아듣',
  '엿듣',
  '일컫',
  '눋',
  '붇',
  '겯',
  '긷',
  '내리걷',
  '되묻',
  '알아듣',
]);

/**
 * ㅂ → 우, for verbs.
 *
 * Verbs are the short list; adjectives are handled by the rule below, because
 * for adjectives the irregular class is the *default*.
 */
export const B_IRREGULAR_VERBS = new Set(['돕', '굽', '눕', '줍', '깁', '여쭙', '뵙']);

/**
 * ㅂ-final adjectives that are *regular*, which is the shorter list.
 *
 * Every other ㅂ-final adjective is irregular: 춥다 → 추워요, 무겁다 → 무거워요,
 * 아름답다 → 아름다워요. Stating the exceptions rather than the members is what
 * keeps this correct for a word nobody has added yet.
 */
export const B_REGULAR_ADJECTIVES = new Set(['좁', '수줍', '굽']);

/** ㅅ drops. Everything else ending in ㅅ is regular. */
export const S_IRREGULAR = new Set(['긋', '낫', '붓', '잇', '잣', '젓', '짓', '짝짓', '가로젓', '되짓']);

/**
 * ㅎ-irregular adjectives, in full.
 *
 * A closed class, and applying it by spelling would be actively wrong: 낳다,
 * 넣다, 놓다, 닿다, 쌓다 and 좋다 all end in ㅎ and are perfectly regular. If
 * 낳 lost its ㅎ it would conjugate as 나, which is the pronoun "I".
 */
export const H_IRREGULAR = new Set([
  '그렇', '이렇', '저렇', '어떻', '아무렇',
  '까맣', '꺼멓', '노랗', '누렇', '빨갛', '뻘겋', '파랗', '퍼렇', '하얗', '허옇',
  '동그랗', '조그맣', '커다랗', '뿌옇', '발갛', '거멓', '새까맣', '새하얗', '샛노랗', '시뻘겋',
]);

/** 르 stems that are plain ㅡ-droppers rather than ㄹ-doublers. */
export const REU_REGULAR = new Set(['따르', '들르', '치르', '다다르']);

/**
 * 르 stems that take 러: 푸르 + 어 → 푸르러.
 *
 * 누르다 is deliberately absent. It is two words — "press", which is a verb and
 * doubles its ㄹ (눌러요), and "yellowish", which is an adjective and takes 러
 * (누르러요). The verb is the one anybody looks up, and the adjective is
 * reachable with an override.
 */
export const REO_IRREGULAR = new Set(['푸르', '노르']);

/** Stems whose conjugation is not derived at all. */
export const SUPPLETIVE = new Set(['있', '없', '이', '아니', '드리', '푸']);

/**
 * Stems built on the honorific suffix `-시-`.
 *
 * These conjugate regularly everywhere except in the two forms that end in
 * 요 and address the listener: 시 + 어 contracts to 셔 like any other ㅣ-stem
 * (계셔서, 계셨어요, 계셔 주세요), but the polite present is the fused 계세요,
 * not 계셔요, and asking an already-honorific verb to be honorific again gives
 * 계세요 rather than 계시세요.
 *
 * It cannot be done by spelling — 마시다 also ends in 시 and is not honorific
 * at all, and 마세요 would be the wrong verb ("please don't") — so the stems
 * are listed.
 *
 * This used to live in `SUPPLETIVE`, where the whole word was pinned to 계세
 * and every other form was derived from *that*: the past came out 계셌어요,
 * which is not a Korean word, and 계세 주세요 with it. Two of those shipped in
 * the level test. The fix is to pin only the forms that are actually irregular.
 */
export const HONORIFIC_SUFFIXED = new Set([
  '계시', '드시', '주무시', '잡수시', '돌아가시', '자시', '있으시',
]);

/** Suffixes that make an adjective ㅂ-irregular by construction. */
const B_SUFFIXES = ['답', '롭', '스럽', '겹'];

export interface ClassifyOptions {
  /** `verb` or `adjective`, where the caller knows it. Changes ㅂ and ㅎ. */
  partOfSpeech?: 'verb' | 'adjective' | string;
  /** Forces a class, for a homograph whose sense the caller knows. */
  override?: ConjugationClass;
}

/** The stem of a dictionary form: 먹다 → 먹. Null if it is not one. */
export function stemOf(lemma: string): string | null {
  if (lemma.length < 2 || !lemma.endsWith('다')) return null;
  const stem = lemma.slice(0, -1);
  return [...stem].every(isHangulSyllable) ? stem : null;
}

export function classify(lemma: string, options: ClassifyOptions = {}): ConjugationClass {
  if (options.override) return options.override;
  const stem = stemOf(lemma);
  if (!stem) return 'regular';
  if (SUPPLETIVE.has(stem)) return 'irregularStem';

  const last = stem[stem.length - 1]!;
  const parts = decompose(last);
  if (!parts) return 'regular';
  const final = FINALS[parts.final]!.trim();

  if (final === '') {
    if (last === '하') return 'hada';
    if (last === '르') {
      if (REO_IRREGULAR.has(stem)) return 'reo';
      if (REU_REGULAR.has(stem)) return 'eu';
      // Every other 르 stem doubles its ㄹ. This is the productive default and
      // the two exception sets above are both closed.
      return stem.length > 1 ? 'reu' : 'eu';
    }
    // ㅡ is the only vowel that drops, and it drops in every stem that has it.
    if (parts.medial === 18) return 'eu';
    return 'regular';
  }

  const adjective = options.partOfSpeech === 'adjective';
  switch (final) {
    case 'ㄷ':
      return D_IRREGULAR.has(stem) ? 'd' : 'regular';
    case 'ㅂ':
      /*
       * Part of speech first, because 굽다 is on both lists: the verb "to bake"
       * is irregular (구워요) and the adjective "bent" is regular (굽어요). One
       * spelling, two words, two classes — and reading the lists in the wrong
       * order silently gives every grilling sentence the wrong verb.
       */
      if (!adjective && B_IRREGULAR_VERBS.has(stem)) return 'b';
      if (adjective && B_REGULAR_ADJECTIVES.has(stem)) return 'regular';
      if (B_SUFFIXES.some((suffix) => stem.endsWith(suffix))) return 'b';
      // Otherwise: an adjective ending in ㅂ is irregular, a verb is regular.
      return adjective ? 'b' : 'regular';
    case 'ㅅ':
      return S_IRREGULAR.has(stem) ? 's' : 'regular';
    case 'ㅎ':
      return H_IRREGULAR.has(stem) ? 'h' : 'regular';
    case 'ㄹ':
      return 'l';
    default:
      return 'regular';
  }
}
