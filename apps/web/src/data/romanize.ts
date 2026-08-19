import { toJamo } from './jamo';

/**
 * Revised Romanisation of a single syllable block.
 *
 * Scoped to one syllable on purpose. Romanising a whole *word* requires the
 * sound changes that happen where two syllables meet — 좋다 is *jota*, 국립 is
 * *gungnip* — and those need the surrounding letters. That work is done once,
 * in the content pipeline (`scripts/content/hangul.py`), and the result is
 * stored on each vocabulary word. Duplicating it here would give the app a
 * second implementation to disagree with.
 *
 * Inside one block there is no boundary and therefore no assimilation, so this
 * is exact rather than approximate. `data.test.ts` checks it against the
 * pipeline's output for every syllable in the curriculum.
 */

const INITIAL: Record<string, string> = {
  ㄱ: 'g', ㄲ: 'kk', ㄴ: 'n', ㄷ: 'd', ㄸ: 'tt', ㄹ: 'r', ㅁ: 'm', ㅂ: 'b',
  ㅃ: 'pp', ㅅ: 's', ㅆ: 'ss', ㅇ: '', ㅈ: 'j', ㅉ: 'jj', ㅊ: 'ch', ㅋ: 'k',
  ㅌ: 't', ㅍ: 'p', ㅎ: 'h',
};

const MEDIAL: Record<string, string> = {
  ㅏ: 'a', ㅐ: 'ae', ㅑ: 'ya', ㅒ: 'yae', ㅓ: 'eo', ㅔ: 'e', ㅕ: 'yeo', ㅖ: 'ye',
  ㅗ: 'o', ㅘ: 'wa', ㅙ: 'wae', ㅚ: 'oe', ㅛ: 'yo', ㅜ: 'u', ㅝ: 'wo', ㅞ: 'we',
  ㅟ: 'wi', ㅠ: 'yu', ㅡ: 'eu', ㅢ: 'ui', ㅣ: 'i',
};

/**
 * A final consonant is released as one of seven sounds, whatever letter is
 * written: 밥, 잎 and 앞 all end in a *p*. This is the single most useful thing
 * a beginner can be told about 받침, and the romanisation has to reflect it or
 * it teaches the opposite.
 */
const FINAL: Record<string, string> = {
  ㄱ: 'k', ㄲ: 'k', ㄳ: 'k', ㄴ: 'n', ㄵ: 'n', ㄶ: 'n', ㄷ: 't', ㄹ: 'l',
  ㄺ: 'k', ㄻ: 'm', ㄼ: 'l', ㄽ: 'l', ㄾ: 'l', ㄿ: 'p', ㅀ: 'l', ㅁ: 'm',
  ㅂ: 'p', ㅄ: 'p', ㅅ: 't', ㅆ: 't', ㅇ: 'ng', ㅈ: 't', ㅊ: 't', ㅋ: 'k',
  ㅌ: 't', ㅍ: 'p', ㅎ: 't',
};

export function romanizeSyllable(syllable: string): string {
  const jamo = toJamo(syllable);
  if (jamo.length < 2) return syllable;
  const [initial, medial, final] = jamo;
  const head = INITIAL[initial!];
  const body = MEDIAL[medial!];
  if (head === undefined || body === undefined) return syllable;
  return head + body + (final ? (FINAL[final] ?? '') : '');
}
