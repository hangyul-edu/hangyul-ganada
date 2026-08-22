/**
 * Syllable arithmetic. Everything else in this package is built on it.
 *
 * Hangul is composed rather than sequenced: 먹 is not three characters, it is
 * one whose code point encodes (ㅁ, ㅓ, ㄱ). Conjugation is almost entirely a
 * matter of taking that triple apart, changing one member of it and putting it
 * back together — 걷 + 어 is ㄱ/ㅓ/ㄷ becoming ㄱ/ㅓ/ㄹ and then 어 — so the
 * three functions here are the whole vocabulary the rest of the package needs.
 */

const BASE = 0xac00;
const LAST = 0xd7a3;
const MEDIALS = 21;
const FINALS_COUNT = 28;

export const VOWELS = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
export const FINALS = ' ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ';
export const INITIALS = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';

export interface Syllable {
  initial: number;
  medial: number;
  final: number;
}

export function decompose(char: string): Syllable | null {
  const code = (char.codePointAt(0) ?? 0) - BASE;
  if (code < 0 || code > LAST - BASE) return null;
  return {
    initial: Math.floor(code / (MEDIALS * FINALS_COUNT)),
    medial: Math.floor(code / FINALS_COUNT) % MEDIALS,
    final: code % FINALS_COUNT,
  };
}

export function compose(initial: number, medial: number, final = 0): string {
  return String.fromCodePoint(BASE + (initial * MEDIALS + medial) * FINALS_COUNT + final);
}

/** The syllable with a different final consonant. */
export function withFinal(char: string, final: string): string {
  const parts = decompose(char);
  if (!parts) return char;
  return compose(parts.initial, parts.medial, FINALS.indexOf(final));
}

export function isHangulSyllable(char: string): boolean {
  return decompose(char) !== null;
}

/** Whether the syllable ends in a consonant — the 받침 every ending asks about. */
export function hasFinal(char: string): boolean {
  return (decompose(char)?.final ?? 0) !== 0;
}

export function finalOf(char: string): string {
  const parts = decompose(char);
  return parts ? (FINALS[parts.final] ?? ' ').trim() : '';
}

export function vowelOf(char: string): string {
  const parts = decompose(char);
  return parts ? (VOWELS[parts.medial] ?? '') : '';
}

/**
 * Whether a stem takes 아 rather than 어.
 *
 * The rule is written as "bright vowels take 아", and the bright vowels for
 * this purpose are ㅏ and ㅗ only. ㅑ and ㅛ are bright in vowel-harmony terms
 * and do not occur as the last vowel of a native verb stem, so including them
 * would add a case that never fires and one that would be wrong if it did.
 */
export function isBright(vowel: string): boolean {
  return vowel === 'ㅏ' || vowel === 'ㅗ';
}
