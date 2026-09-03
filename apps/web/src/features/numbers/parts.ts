import type { NumberItem } from '@hangyul-ganada/shared-types';

/**
 * A Korean numeral, split into the pieces a learner puts together.
 *
 * ## Why this reads the Korean instead of building it
 *
 * The obvious way round is to take the item's `value` and generate the Korean:
 * 35 → 삼십오. It is also the way to ship a wrong reading. 16 is written 십육
 * and said 심뉵; June is 유월 and not 육월; a native numeral before a counter is
 * 한 and not 하나; 10,000 is 만 and never 일만. Every one of those is an
 * exception a generator has to be told about, and the ones nobody remembers to
 * tell it about ship as confident nonsense.
 *
 * The item already carries the authored Korean, read and checked. So this
 * *segments* that string rather than producing one: a greedy longest-match over
 * the atomic morphemes, which can only ever return pieces that were already in
 * the word. Anything it cannot segment cleanly returns `null`, and the screen
 * falls back to the sentence — a missing diagram is a smaller failure than a
 * diagram that teaches a spelling the language does not have.
 *
 * ## What a part is for
 *
 * `place` is what the piece *does*, and it is what the breakdown colours by, so
 * a learner sees 삼십오 as three-ten-five rather than as three syllables. The
 * tens word in a native numeral — 스물, 서른 — is its own atom and is marked
 * `tens` rather than being pulled apart, because it is not two-ten in Korean
 * and teaching it as one would be teaching a false rule.
 */
export type NumberPlace =
  /** 일 … 구, 하나 … 아홉. The ones. */
  | 'ones'
  /** 십. */
  | 'ten'
  /** 열, and the native tens words that are single morphemes: 스물, 서른, … */
  | 'tens'
  | 'hundred'
  | 'thousand'
  | 'tenThousand'
  | 'hundredMillion'
  /** 공 and 영. */
  | 'zero';

export interface NumberPart {
  /** The Korean, exactly as it appears in the word. */
  korean: string;
  place: NumberPlace;
}

/**
 * The morphemes, longest first so the greedy match cannot split a long one.
 *
 * Native tens are here as whole words on purpose — see the note above — and so
 * is 열, which behaves as a tens word even though it is one syllable.
 */
const ATOMS: ReadonlyArray<readonly [string, NumberPlace]> = [
  // Native, two syllables and up, before anything that is a prefix of them.
  ['하나', 'ones'],
  ['다섯', 'ones'],
  ['여섯', 'ones'],
  ['일곱', 'ones'],
  ['여덟', 'ones'],
  ['아홉', 'ones'],
  ['스물', 'tens'],
  ['스무', 'tens'],
  ['서른', 'tens'],
  ['마흔', 'tens'],
  ['예순', 'tens'],
  ['일흔', 'tens'],
  ['여든', 'tens'],
  ['아흔', 'tens'],
  ['쉰', 'tens'],
  ['열', 'tens'],
  // Native ones, one syllable.
  ['둘', 'ones'],
  ['셋', 'ones'],
  ['넷', 'ones'],
  ['한', 'ones'],
  ['두', 'ones'],
  ['세', 'ones'],
  ['네', 'ones'],
  // Sino places.
  ['억', 'hundredMillion'],
  ['만', 'tenThousand'],
  ['천', 'thousand'],
  ['백', 'hundred'],
  ['십', 'ten'],
  // Sino ones.
  ['일', 'ones'],
  ['이', 'ones'],
  ['삼', 'ones'],
  ['사', 'ones'],
  ['오', 'ones'],
  ['육', 'ones'],
  ['칠', 'ones'],
  ['팔', 'ones'],
  ['구', 'ones'],
  ['공', 'zero'],
  ['영', 'zero'],
];

/**
 * Splits a Korean numeral into its parts, or `null` if it is not one.
 *
 * `null` for anything with a residue the table does not cover — a counter, a
 * phrase, a word with a particle on it. Callers draw the sentence instead.
 */
export function splitNumeral(korean: string): NumberPart[] | null {
  const parts: NumberPart[] = [];
  let at = 0;
  while (at < korean.length) {
    const match = ATOMS.find(([atom]) => korean.startsWith(atom, at));
    if (!match) return null;
    parts.push({ korean: match[0], place: match[1] });
    at += match[0].length;
  }
  return parts.length > 0 ? parts : null;
}

/**
 * The parts of an item, when breaking it down teaches something.
 *
 * A single-part numeral returns `null`: 오 is 5, there is nothing to put
 * together, and a diagram of one chip pointing at itself is the visual form of
 * the tautology the Numbers feedback was cleared of. So is anything that is not
 * a numeral — a counter, a phrase, a form — and anything whose *reading*
 * differs from its spelling, because the pieces would then be a spelling the
 * learner is not going to say. 십육 is taught by its authored note, which
 * explains the sound change, and not by a row of chips that hides it.
 */
export function numberParts(item: NumberItem): NumberPart[] | null {
  if (item.role !== 'numeral') return null;
  if (item.reading && item.reading !== item.korean) return null;
  const parts = splitNumeral(item.korean);
  if (!parts || parts.length < 2) return null;
  return parts;
}
