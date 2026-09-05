/**
 * When are two Korean strings the *same answer*?
 *
 * ## Why this is a module and not a comparison
 *
 * A learning engine has to answer this question in three places and it had a
 * different answer in each. The Numbers option builder deduplicated on the raw
 * string, so `한 개` and `한개` were two options. The level-test ambiguity gate
 * had its own rules for the same thing, written in a QA script. And nothing at
 * all decided whether `학교에 가요` and `학교에 갑니다` are one answer or two.
 *
 * They are not the same question in every context, and that is the point of
 * returning a *reason* rather than a boolean. A spacing difference is a
 * duplicate in a listening question and the entire content of a spacing
 * question. The caller knows which it is; this module knows what the difference
 * is.
 *
 * ## What it does not do
 *
 * It does not decide meaning. Two strings that share no morphology are simply
 * `different` here, whatever a dictionary says about them — synonymy is a
 * judgement and it is made against the relations data elsewhere. Everything
 * below is a deterministic function of the two strings and the conjugation
 * tables, so the same pair always gives the same answer, and a disagreement is
 * a bug rather than a matter of opinion.
 */
import { classify, stemOf } from './classes';
import { conjugate, FORMS, type Form, type WordShape } from './conjugate';
import { decompose, hasFinal } from './hangul';

/** How two strings differ, once they are not identical. */
export type Difference =
  /** The same characters, differently spaced: 한 개 / 한개. */
  | 'spacing'
  /** The particle alternant chosen for the wrong final: 학교를 / 학교을. */
  | 'particle'
  /** The same word at a different politeness level: 가요 / 갑니다. */
  | 'politeness'
  /** The same lemma inflected differently: 가요 / 갔어요. */
  | 'inflection'
  /** The plain numeral where the counting form belongs: 하나 개 / 한 개. */
  | 'countingForm'
  /** Nothing this module can relate. */
  | 'different';

export interface Equivalence {
  /** True only for `identical`, `spacing` and `particle`. See `SAME_ANSWER`. */
  same: boolean;
  /** Why, or why not. `identical` when the two strings are equal after trimming. */
  difference: 'identical' | Difference;
  /** The two strings after `normalise`, for a caller that wants to show them. */
  normalised: [string, string];
}

/**
 * The differences that make two strings one answer.
 *
 * Spacing and particle choice are *orthographic*: a learner who writes 한개 has
 * chosen the right words, and one who writes 학교을 has chosen the right
 * particle and the wrong allomorph of it. Politeness and inflection are not —
 * 갑니다 is a different thing to say than 가요, and a course that teaches the
 * distinction cannot accept either for the other.
 */
const SAME_ANSWER: ReadonlySet<string> = new Set(['identical', 'spacing', 'particle']);

/** Trimmed, inner whitespace collapsed, terminal punctuation removed. */
export function normalise(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.!?。！？…]+$/u, '')
    .trim();
}

/** The same with every space removed — the key two spacings share. */
const unspaced = (text: string): string => normalise(text).replace(/\s+/g, '');

/**
 * The particle alternations Korean chooses by the previous syllable's final.
 *
 * Each pair is [after a final consonant, after a vowel]. A learner who writes
 * the wrong one of a pair has picked the right particle: 학교을 is 학교를 with
 * the consonant-final alternant, not a different sentence.
 */
const PARTICLE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['은', '는'],
  ['이', '가'],
  ['을', '를'],
  ['과', '와'],
  ['으로', '로'],
  ['이에요', '예요'],
  ['이라고', '라고'],
];

/** The counting forms, and the plain numerals a learner writes instead. */
const COUNTING_FORM: Readonly<Record<string, string>> = {
  하나: '한',
  둘: '두',
  셋: '세',
  넷: '네',
  스물: '스무',
};

/** Whether the two strings differ only in which alternant of one particle they use. */
function particleOnly(a: string, b: string): boolean {
  for (const [afterConsonant, afterVowel] of PARTICLE_PAIRS) {
    for (const [from, to] of [
      [afterConsonant, afterVowel],
      [afterVowel, afterConsonant],
    ] as const) {
      if (!a.endsWith(from) || !b.endsWith(to)) continue;
      if (a.slice(0, -from.length) !== b.slice(0, -to.length)) continue;
      return true;
    }
  }
  return false;
}

/**
 * Every surface `lemma` takes, as surface → form.
 *
 * `conjugate` classifies the stem itself when no override is given, so this
 * passes the empty shape rather than guessing a part of speech: a caller who
 * knows the word is an adjective should be conjugating it themselves. The
 * classification is what makes 듣다 produce 들어요 and 듣습니다 from one lemma.
 */
function surfaces(lemma: string): Map<string, Form> {
  const shape: WordShape = { override: classify(lemma) };
  const found = new Map<string, Form>();
  for (const form of FORMS) {
    const surface = conjugate(lemma, form, shape);
    if (surface && !found.has(surface)) found.set(surface, form);
  }
  return found;
}

/**
 * Which forms count as a politeness difference rather than a different meaning.
 *
 * `presentPolite` and `formalPolite` are one event said two ways — 가요 and
 * 갑니다 — and `dictionary` is the same event with no politeness on it at all.
 * A past tense is not on this list: 갔어요 says something different about the
 * world, and a course that accepted it for 가요 would be teaching neither.
 *
 * The names are `Form`'s own, so a form added to `conjugate.ts` is absent here
 * until somebody decides which of the two things it is.
 */
const POLITENESS_FORMS: ReadonlySet<Form> = new Set<Form>([
  'presentPolite',
  'formalPolite',
  'dictionary',
]);

/**
 * Are these two strings the same answer, and if not, how do they differ?
 *
 * `lemma` is optional and only used for the inflection tests: without it the
 * function still detects identity, spacing, particle choice and the counting
 * form, all of which are properties of the two strings alone.
 */
export function compare(a: string, b: string, lemma?: string): Equivalence {
  const left = normalise(a);
  const right = normalise(b);
  const pair: [string, string] = [left, right];
  const result = (difference: Equivalence['difference']): Equivalence => ({
    same: SAME_ANSWER.has(difference),
    difference,
    normalised: pair,
  });

  if (left === right) return result('identical');
  if (unspaced(left) === unspaced(right)) return result('spacing');
  if (particleOnly(unspaced(left), unspaced(right))) return result('particle');

  // 하나 개 against 한 개: the right words, the wrong shape of the numeral.
  for (const [plain, counting] of Object.entries(COUNTING_FORM)) {
    const swapped = left.replace(plain, counting);
    if (swapped !== left && unspaced(swapped) === unspaced(right)) return result('countingForm');
    const back = right.replace(plain, counting);
    if (back !== right && unspaced(back) === unspaced(left)) return result('countingForm');
  }

  if (lemma) {
    const table = surfaces(lemma);
    const leftForm = table.get(left);
    const rightForm = table.get(right);
    if (leftForm && rightForm) {
      const bothPoliteness =
        POLITENESS_FORMS.has(leftForm) && POLITENESS_FORMS.has(rightForm);
      return result(bothPoliteness ? 'politeness' : 'inflection');
    }
  }

  return result('different');
}

/**
 * The stem two surfaces share, where they share one.
 *
 * Used to answer *is this the same word* without deciding *is this the same
 * answer*: a review screen showing 가요 may fairly offer 갔어요 as a distractor,
 * and may not offer 갑니다.
 */
export function sameLemma(a: string, b: string, lemma: string): boolean {
  const table = surfaces(lemma);
  return table.has(normalise(a)) && table.has(normalise(b));
}

export { stemOf, hasFinal, decompose };
