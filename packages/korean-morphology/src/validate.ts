/**
 * Grading a Korean answer a learner *typed*, and being able to say why.
 *
 * ## Why this is separate from `compare`
 *
 * `compare(a, b)` answers a question about two strings: are they the same
 * answer, and what is the difference. It is symmetric, it has no opinion about
 * which string is the learner's, and it deliberately returns a class rather
 * than a verdict, because the same class is a match in one question type and
 * the whole content of another.
 *
 * Grading is the asymmetric use of that. One string is what the course asked
 * for and the other is what a person wrote, the policy is fixed by the question
 * rather than by the caller's mood, and the answer a learner needs is not
 * *which class* but *what to change*. A grader that returns `inflection` has
 * told the learner nothing they can act on; one that returns "you wrote the
 * past tense of this verb and the question asked for the present" has.
 *
 * ## Why the explanation is data and not a sentence
 *
 * This product ships thirty-two interface languages and treats a missing
 * translation as a build failure. A module that returned English prose would
 * either ship English into thirty-one of them or need a translation table it
 * has no business owning. So a rejection carries `facts` — the two forms, the
 * two particles, the stem and whether it ends in a consonant, the numeral and
 * its counting form — and the interface says it in the learner's language from
 * strings it already owns. Nothing here is a sentence.
 *
 * ## What it does not do
 *
 * It does not decide meaning, for the same reason `compare` does not: two
 * strings that share no morphology are `different` whatever a dictionary says.
 * It does not spell-check: a typo that happens to be another word is that other
 * word. And it does not guess at intent — an answer with no Hangul in it is
 * reported as such rather than scored against a Korean target.
 */
import { compare, normalise, type Difference } from './equivalence';
import { classify, stemOf } from './classes';
import { conjugate, FORMS, type Form, type WordShape } from './conjugate';
import { hasFinal } from './hangul';

/** What the learner has to change, named so the interface can say it. */
export type AnswerError =
  /** Nothing was typed. */
  | 'empty'
  /** No Hangul at all — a romanisation, a translation, or a stray keystroke. */
  | 'notKorean'
  /** The words are right and the spaces are not, in a question about spacing. */
  | 'spacing'
  /** A different particle, or the wrong alternant where the question is about the rule. */
  | 'particle'
  /** The plain numeral where a counting form belongs: 하나 개 for 한 개. */
  | 'countingForm'
  /** The same event at the wrong politeness level: 갑니다 for 가요. */
  | 'politeness'
  /** The right lemma, the wrong inflection: 갔어요 for 가요. */
  | 'inflection'
  /** Nothing this module can relate to the expected answer. */
  | 'different';

/** Everything the interface needs to explain a rejection in its own language. */
export interface AnswerFacts {
  /** The conjugated form the learner wrote, where it is one of the lemma's. */
  typedForm?: Form;
  /** The form the question asked for. */
  expectedForm?: Form;
  /** The particle the learner ended on, where the difference is a particle. */
  typedParticle?: string;
  /** The particle the expected answer ends on. */
  expectedParticle?: string;
  /** The syllable the particle attaches to, and whether it has a 받침. */
  stem?: string;
  stemEndsInConsonant?: boolean;
  /** 하나 and 한, where a counting form was wanted. */
  plainNumeral?: string;
  countingForm?: string;
}

export interface Accepted {
  accepted: true;
  /** Why it was accepted, so a caller may still show the tidier spelling. */
  tolerated: 'identical' | 'spacing' | 'particle';
  /** Present when the learner chose the wrong alternant of the right particle. */
  facts?: AnswerFacts;
}

export interface Rejected {
  accepted: false;
  error: AnswerError;
  facts?: AnswerFacts;
}

export type Validation = Accepted | Rejected;

export interface ValidateOptions {
  /** The dictionary form, when the question is about a verb or adjective. */
  lemma?: string;
  /**
   * Spacing is the distinction being taught, so 한개 is wrong for 한 개.
   *
   * Off by default: in most questions a learner who wrote the right words has
   * answered the question, and correcting the space is a note rather than a
   * mark. A spacing lesson turns it on and the same input is a rejection with
   * `spacing` — which is exactly the asymmetry `compare` refuses to guess at.
   */
  spacingIsTheAnswer?: boolean;
  /**
   * The particle alternant is the distinction being taught, so 학교을 is wrong
   * for 학교를. Off by default, and for the same reason.
   */
  particleIsTheAnswer?: boolean;
}

/** The particle alternations, and which member goes after a 받침. */
const PARTICLE_PAIRS: ReadonlyArray<readonly [afterConsonant: string, afterVowel: string]> = [
  ['은', '는'],
  ['이', '가'],
  ['을', '를'],
  ['과', '와'],
  ['으로', '로'],
  ['이에요', '예요'],
  ['이라고', '라고'],
];

/** Every particle either alternant of every pair can appear as. */
const PARTICLES: readonly string[] = [
  ...new Set(PARTICLE_PAIRS.flatMap(([a, b]) => [a, b])),
  '에',
  '에서',
  '에게',
  '한테',
  '도',
  '만',
  '부터',
  '까지',
  '의',
  '보다',
  '처럼',
].sort((a, b) => b.length - a.length);

const COUNTING_FORM: Readonly<Record<string, string>> = {
  하나: '한',
  둘: '두',
  셋: '세',
  넷: '네',
  스물: '스무',
};

const HANGUL_SYLLABLE = /[가-힣]/;

/** The particle a string ends in, longest first so 으로 beats 로. */
function trailingParticle(text: string): { stem: string; particle: string } | null {
  for (const particle of PARTICLES) {
    if (!text.endsWith(particle) || text.length <= particle.length) continue;
    return { stem: text.slice(0, -particle.length), particle };
  }
  return null;
}

/** Facts about a particle difference: both particles, the stem, and its 받침. */
function particleFacts(typed: string, expected: string): AnswerFacts | undefined {
  const left = trailingParticle(typed.replace(/\s+/g, ''));
  const right = trailingParticle(expected.replace(/\s+/g, ''));
  if (!left || !right) return undefined;
  const last = [...right.stem].pop() ?? '';
  return {
    typedParticle: left.particle,
    expectedParticle: right.particle,
    stem: right.stem,
    stemEndsInConsonant: last ? hasFinal(last) : undefined,
  };
}

/** Every surface the lemma takes, as surface → form. */
function surfaces(lemma: string): Map<string, Form> {
  const shape: WordShape = { override: classify(lemma) };
  const found = new Map<string, Form>();
  for (const form of FORMS) {
    const surface = conjugate(lemma, form, shape);
    if (surface && !found.has(surface)) found.set(surface, form);
  }
  return found;
}

/** Facts about an inflection or politeness difference: the two forms. */
function formFacts(typed: string, expected: string, lemma?: string): AnswerFacts | undefined {
  if (!lemma || !stemOf(lemma)) return undefined;
  const table = surfaces(lemma);
  const typedForm = table.get(normalise(typed));
  const expectedForm = table.get(normalise(expected));
  if (!typedForm && !expectedForm) return undefined;
  return { typedForm, expectedForm };
}

/** Facts about a counting-form difference: the numeral the learner wrote. */
function countingFacts(typed: string): AnswerFacts | undefined {
  for (const [plain, counting] of Object.entries(COUNTING_FORM)) {
    if (typed.includes(plain)) return { plainNumeral: plain, countingForm: counting };
  }
  return undefined;
}

/**
 * Grade a typed Korean answer against the one the question asked for.
 *
 * The verdict is the fixed part and `facts` is the explainable part: a caller
 * that ignores `facts` still grades correctly, and one that renders it can tell
 * the learner which particle, which form, or which numeral to change without
 * this module knowing a word of their language.
 */
export function validate(typed: string, expected: string, options: ValidateOptions = {}): Validation {
  const answer = normalise(typed);
  if (!answer) return { accepted: false, error: 'empty' };
  if (!HANGUL_SYLLABLE.test(answer)) return { accepted: false, error: 'notKorean' };

  const { difference } = compare(answer, expected, options.lemma);

  switch (difference as 'identical' | Difference) {
    case 'identical':
      return { accepted: true, tolerated: 'identical' };

    case 'spacing':
      return options.spacingIsTheAnswer
        ? { accepted: false, error: 'spacing' }
        : { accepted: true, tolerated: 'spacing' };

    case 'particle': {
      const facts = particleFacts(answer, normalise(expected));
      return options.particleIsTheAnswer
        ? { accepted: false, error: 'particle', facts }
        : { accepted: true, tolerated: 'particle', facts };
    }

    case 'countingForm':
      return { accepted: false, error: 'countingForm', facts: countingFacts(answer) };

    case 'politeness':
      return {
        accepted: false,
        error: 'politeness',
        facts: formFacts(answer, expected, options.lemma),
      };

    case 'inflection':
      return {
        accepted: false,
        error: 'inflection',
        facts: formFacts(answer, expected, options.lemma),
      };

    default: {
      /*
       * `different` covers two very different situations and the learner needs
       * them apart: a wrong *particle* on the right word is one keystroke and a
       * rule they have been taught, and a wrong word is a different lesson.
       * `compare` says `different` for both because 학교에 and 학교를 are not
       * alternants of one particle — they are two particles — so the distinction
       * is drawn here, where there is a right answer to compare against.
       */
      const left = trailingParticle(answer.replace(/\s+/g, ''));
      const right = trailingParticle(normalise(expected).replace(/\s+/g, ''));
      if (left && right && left.stem === right.stem && left.particle !== right.particle) {
        const last = [...right.stem].pop() ?? '';
        return {
          accepted: false,
          error: 'particle',
          facts: {
            typedParticle: left.particle,
            expectedParticle: right.particle,
            stem: right.stem,
            stemEndsInConsonant: last ? hasFinal(last) : undefined,
          },
        };
      }
      return { accepted: false, error: 'different' };
    }
  }
}
