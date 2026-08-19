/**
 * Taking a Korean syllable apart.
 *
 * Hangul is composed rather than listed: 각 is not an atom, it is ㄱ + ㅏ + ㄱ
 * packed into one code point by a formula. Every screen in this product that
 * says something about a *letter* rather than a *block* — the readiness note,
 * the romaniser, the character curriculum — needs that formula, so it lives
 * here rather than being reimplemented three times.
 *
 * These functions used to live inside `difficulty.ts`, next to a scoring model
 * they had nothing to do with. They were the reason four unrelated modules
 * imported a classifier.
 */

/** U+AC00, the first composed syllable. */
const SYLLABLE_BASE = 0xac00;
const SYLLABLE_COUNT = 11172;
const FINAL_COUNT = 28;
const MEDIAL_COUNT = 21;

export const INITIAL_JAMO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
export const MEDIAL_JAMO = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
/** Index 0 is "no final consonant", which is why this string starts with a space. */
export const FINAL_JAMO = ' ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ';

/** Whether a character is a composed Hangul syllable. */
export function isSyllable(ch: string): boolean {
  const index = (ch.codePointAt(0) ?? 0) - SYLLABLE_BASE;
  return index >= 0 && index < SYLLABLE_COUNT;
}

/**
 * Splits a Korean string into its constituent jamo.
 *
 * Characters that are not composed syllables pass through unchanged, so a
 * string with a space or a full stop in it does not have to be pre-cleaned.
 */
export function toJamo(text: string): string[] {
  const out: string[] = [];
  for (const ch of text) {
    const index = (ch.codePointAt(0) ?? 0) - SYLLABLE_BASE;
    if (index < 0 || index >= SYLLABLE_COUNT) {
      out.push(ch);
      continue;
    }
    const initial = Math.floor(index / (MEDIAL_COUNT * FINAL_COUNT));
    const medial = Math.floor(index / FINAL_COUNT) % MEDIAL_COUNT;
    const final = index % FINAL_COUNT;
    out.push(INITIAL_JAMO[initial]!, MEDIAL_JAMO[medial]!);
    if (final > 0) out.push(FINAL_JAMO[final]!);
  }
  return out;
}

/** The syllables a learner writes, e.g. 사과 → ["사", "과"]. */
export function toSyllables(word: string): string[] {
  return [...word].filter(isSyllable);
}

/** Whether a syllable carries a 받침 — the consonant at the foot of the block. */
export function hasFinalConsonant(syllable: string): boolean {
  const index = (syllable.codePointAt(0) ?? 0) - SYLLABLE_BASE;
  if (index < 0 || index >= SYLLABLE_COUNT) return false;
  return index % FINAL_COUNT !== 0;
}

/**
 * What shape of block a vowel makes.
 *
 * The three cases are the whole of Hangul block layout: a vowel with a vertical
 * stem stands to the right of the consonant, a vowel built on a horizontal bar
 * sits under it, and a compound of the two wraps around it. `data/compose.ts`
 * turns this into the regions the stroke demonstration draws into.
 */
export type MedialForm = 'vertical' | 'horizontal' | 'wrapped';

const VERTICAL_MEDIALS = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅣ';
const HORIZONTAL_MEDIALS = 'ㅗㅛㅜㅠㅡ';

/**
 * The two letters a wrapped vowel is written as, horizontal arm first.
 *
 * The same decomposition `characters.ts` teaches — ㅘ is ㅗ then ㅏ — and the
 * same order, so a block and the letter it contains are written the same way.
 */
export const MEDIAL_PARTS: Record<string, [horizontal: string, vertical: string]> = {
  ㅘ: ['ㅗ', 'ㅏ'],
  ㅙ: ['ㅗ', 'ㅐ'],
  ㅚ: ['ㅗ', 'ㅣ'],
  ㅝ: ['ㅜ', 'ㅓ'],
  ㅞ: ['ㅜ', 'ㅔ'],
  ㅟ: ['ㅜ', 'ㅣ'],
  ㅢ: ['ㅡ', 'ㅣ'],
};

/**
 * Vertical vowels whose branch hangs off the *left* of the stem.
 *
 * ㅏ and ㅓ are the same two strokes mirrored, and a block treats them
 * differently because of it: 가 puts the stem right next to the consonant and
 * lets the branch run out to the edge, while 어 has to hold the stem back so
 * the branch has somewhere to go. Composing both from the same box is what
 * leaves 어 with a gap down its middle and its stem jammed against the frame.
 */
const LEFT_BRANCH_MEDIALS = 'ㅓㅕㅔㅖ';

/** Whether a vertical vowel's branch is on the left of its stem. */
export function branchesLeft(medial: string): boolean {
  return LEFT_BRANCH_MEDIALS.includes(medial);
}

/** Which of the three a vowel is, or null if the character is not a vowel. */
export function medialForm(medial: string): MedialForm | null {
  if (VERTICAL_MEDIALS.includes(medial)) return 'vertical';
  if (HORIZONTAL_MEDIALS.includes(medial)) return 'horizontal';
  if (medial in MEDIAL_PARTS) return 'wrapped';
  return null;
}
